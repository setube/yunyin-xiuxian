package com.games.wenzi.yunyin;

import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private View loadingOverlay;
    private View enterButton;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean loadingDismissed = false;
    private Runnable enterButtonRunnable;

    /**
     * 系统栏占位,CSS 像素。
     *
     * 我们开了边到边(setDecorFitsSystemWindows(false),targetSdk 36 也会强制),网页内容
     * 铺到导航栏底下 —— 而 Android WebView **不会**把导航栏高度写进 CSS 的
     * env(safe-area-inset-bottom),那个值在安卓上恒为 0。于是三键导航的老机型上,
     * 页面底部的导航条整排被系统按钮盖住(玩家反馈)。手势导航机型看不出来:
     * 那条小横杠是半透明的,内容从底下透出来反而好看。
     *
     * 所以由原生把真实占位量出来,经 NativeApp 桥交给页面自己垫。
     * 底部取 tappableElement 而不是 navigationBars:三键导航两者相等(约 48dp),
     * 手势导航前者为 0、后者是横杠区 —— 正好只在「按钮真会挡住点按」时才垫。
     * JS 侧读到的是 CSS px,故除以 density。
     */
    private volatile float insetTopCss = 0f;
    private volatile float insetBottomCss = 0f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate 前登记:BridgeActivity 会在 super 里创建 Bridge,
        // 晚一步注册的插件不会出现在 JS 的 PluginHeaders 中。
        registerPlugin(SaveTransferPlugin.class);
        super.onCreate(savedInstanceState);

        // 沉浸式状态栏
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);

        // BridgeActivity 已创建自己的 WebView 布局，手动 inflate 遮罩层叠加到上面
        loadingOverlay = getLayoutInflater().inflate(R.layout.activity_main, null);
        addContentView(loadingOverlay, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        enterButton = loadingOverlay.findViewById(R.id.enterButton);

        // 点击"进入游戏"手动关闭遮罩
        enterButton.setOnClickListener(v -> dismissLoading());

        // 5秒后如果还没加载完，显示进入按钮
        enterButtonRunnable = () -> {
            if (!loadingDismissed && enterButton != null) {
                enterButton.setVisibility(View.VISIBLE);
                enterButton.setAlpha(0f);
                enterButton.animate().alpha(1f).setDuration(300).start();
            }
        };
        handler.postDelayed(enterButtonRunnable, 5000);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // 系统栏占位:每次窗口 insets 变化(旋转、切换导航模式)都重新量,并通知页面重读
            final float density = getResources().getDisplayMetrics().density;
            ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
                Insets status = insets.getInsets(WindowInsetsCompat.Type.statusBars());
                Insets tappable = insets.getInsets(WindowInsetsCompat.Type.tappableElement());
                float top = status.top / density;
                float bottom = tappable.bottom / density;
                if (top != insetTopCss || bottom != insetBottomCss) {
                    insetTopCss = top;
                    insetBottomCss = bottom;
                    // 页面可能还没加载(首次派发在 attach 时),事件丢了也无妨:组件挂载时会主动读一次
                    v.post(() -> ((WebView) v).evaluateJavascript(
                        "window.dispatchEvent(new Event('nativeinsets'))", null));
                }
                return insets;
            });
            ViewCompat.requestApplyInsets(webView);

            // 注册 JS 接口:隐藏遮罩 + 读系统栏占位(方法在 JavaBridge 线程上被调,只读 volatile 字段)
            webView.addJavascriptInterface(new Object() {
                @android.webkit.JavascriptInterface
                public void hideLoading() {
                    runOnUiThread(() -> dismissLoading());
                }

                @android.webkit.JavascriptInterface
                public float insetTop() {
                    return insetTopCss;
                }

                @android.webkit.JavascriptInterface
                public float insetBottom() {
                    return insetBottomCss;
                }
            }, "NativeApp");

            // 等 Capacitor 起好页面后,由原生轮询「Vue 渲染完成了没」,渲染完就撤遮罩。
            // 轮询放在原生而不是注入一段自转的 JS:下面的自愈会 reload 页面,注入的脚本随之消失,
            // 原生驱动的轮询才能跨过 reload 继续盯着。
            handler.postDelayed(() -> pollForApp(System.currentTimeMillis()), 500);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
    }

    /** 自愈只做一次,防止 reload 循环 */
    private boolean healAttempted = false;

    /** Vue 挂好了没:#app 有子节点即算渲染完成 */
    private static final String JS_APP_READY =
        "(function(){var a=document.getElementById('app');return !!(a&&a.children.length>0)})()";

    /**
     * 自愈脚本:注销全部 Service Worker、清掉它开的缓存,然后重载。
     *
     * 页面迟迟没有 #app,多半是 1.34.0 注册进来的离线缓存 SW 在作怪:它接管导航后
     * fetch() https://localhost 失败、缓存又无副本,整页只剩「离线且无缓存副本」,
     * #app 永远不出现,遮罩就永远不消失(玩家反馈)。第一次启动总是正常的(那次 SW 还没接管),
     * 第二次起才中招。网页侧已不再在 Capacitor 里注册,但已中招的玩家那份 SW 先于新页面执行,
     * 新代码根本跑不到 —— 这段由原生注入,在任何文档里都跑,替玩家把它拆掉。
     * 只动 SW 与 CacheStorage,localStorage(存档)不碰。
     */
    private static final String JS_HEAL =
        "(function(){var sw=navigator.serviceWorker;if(!sw||!sw.getRegistrations)return;" +
        "sw.getRegistrations().then(function(rs){if(!rs.length)return;" +
        "console.warn('yunyin: #app 迟迟未出现且存在 Service Worker,注销 '+rs.length+' 个并重载');" +
        "return Promise.all(rs.map(function(r){return r.unregister()}))" +
        ".then(function(){return caches.keys()})" +
        ".then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))})" +
        ".then(function(){location.reload()})})})()";

    private void pollForApp(long startedAt) {
        if (loadingDismissed) return;
        WebView wv = getBridge().getWebView();
        if (wv == null) return;
        wv.evaluateJavascript(JS_APP_READY, value -> {
            if ("true".equals(value)) {
                dismissLoading();
                return;
            }
            if (!healAttempted && System.currentTimeMillis() - startedAt > 6000) {
                healAttempted = true;
                wv.evaluateJavascript(JS_HEAL, null);
            }
            handler.postDelayed(() -> pollForApp(startedAt), 200);
        });
    }

    private void dismissLoading() {
        if (loadingDismissed || loadingOverlay == null) return;
        loadingDismissed = true;
        if (enterButtonRunnable != null) {
            handler.removeCallbacks(enterButtonRunnable);
        }
        loadingOverlay.animate()
            .alpha(0f)
            .setDuration(300)
            .withEndAction(() -> loadingOverlay.setVisibility(View.GONE))
            .start();
    }
}
