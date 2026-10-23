package com.games.wenzi.yunyin;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Android 存档导出桥:交给系统保存面板选位置,再用 ContentResolver 写入。
 *
 * 不走公共 Documents:Android 10 的 legacy storage、Android 11+ 的分区存储
 * 都会让直接写公共目录不可靠;SAF 由用户显式授权目标文件,无需存储权限。
 * 只有真的写完才 resolve(saved=true),取消则 resolve(saved=false),让
 * 网页侧能准确决定是否记「上次导出」。
 */
@CapacitorPlugin(name = "SaveTransfer")
public class SaveTransferPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        String text = call.getString("text");
        String fileName = call.getString("fileName");
        if (text == null || fileName == null || fileName.trim().isEmpty()) {
            call.reject("存档内容或文件名缺失");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // 存档是加密文本,不是标准 JSON;octet-stream 让文件管理器按普通文件保存,
        // 同时保留 EXTRA_TITLE 里的 .save 扩展名。
        intent.setType("application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "onSaveResult");
    }

    @ActivityCallback
    private void onSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK) {
            call.resolve(new JSObject().put("saved", false));
            return;
        }

        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        String text = call.getString("text");
        if (uri == null || text == null) {
            call.reject("没有拿到保存位置或存档内容");
            return;
        }

        // ActivityResult 回调在主线程;存档可能很大,SAF 写入不能在主线程阻塞。
        // Capacitor 的 taskHandler 是插件专用后台线程,结果再投回主线程交给 WebView。
        execute(() -> writeSave(call, uri, text));
    }

    private void writeSave(PluginCall call, Uri uri, String text) {
        JSObject response = new JSObject();
        Exception failure = null;
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (output == null) {
                failure = new IllegalStateException("cannot open target");
            } else {
                output.write(text.getBytes(StandardCharsets.UTF_8));
                output.flush();
                response.put("saved", true).put("uri", uri.toString());
            }
        } catch (Exception error) {
            failure = error;
        }

        Exception error = failure;
        getBridge().executeOnMainThread(() -> {
            if (error == null) {
                call.resolve(response);
            } else {
                String detail = error.getMessage();
                String reason = detail == null || detail.trim().isEmpty() ? "写入存档失败" : "写入存档失败:" + detail;
                call.reject(reason, error);
            }
        });
    }
}
