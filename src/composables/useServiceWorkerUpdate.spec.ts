/**
 * Service Worker 新版本检测 —— useServiceWorkerUpdate 的状态机契约。
 *
 * 这里钉的是纯逻辑部分(registration/installing 的监听流转、controller 门、
 * reload 的消息补发),不真跑 SW:registration/installing 用消息捕获的假体,
 * navigator.serviceWorker.controller 与 location.reload 走 stub。
 * 真浏览器的 SW 生命周期(updatefound 是否派发、skipWaiting 是否生效)由
 * public/sw.js 的实现与浏览器保证,不在本 spec 的钉子范围内。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useServiceWorkerUpdate } from "./useServiceWorkerUpdate";

/** 假 installing worker:可手动推 state,捕获 statechange 监听 */
function makeInstalling() {
  const listeners: Array<() => void> = [];
  const worker = {
    state: "installing" as ServiceWorkerState,
    addEventListener(type: string, fn: () => void) {
      if (type === "statechange") listeners.push(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      if (type !== "statechange") return;
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    postMessage: vi.fn(),
  };
  return {
    worker,
    listenerCount: () => listeners.length,
    setState(s: ServiceWorkerState) {
      worker.state = s;
      for (const fn of listeners) fn();
    },
  };
}

/** 假 registration:捕获 updatefound 监听,记下 update() 调用 */
function makeRegistration(installing: ReturnType<typeof makeInstalling> | null) {
  const updateFoundListeners: Array<() => void> = [];
  const registration = {
    installing: installing?.worker ?? null,
    waiting: null as ServiceWorker | null,
    addEventListener(type: string, fn: () => void) {
      if (type === "updatefound") updateFoundListeners.push(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      if (type !== "updatefound") return;
      const i = updateFoundListeners.indexOf(fn);
      if (i >= 0) updateFoundListeners.splice(i, 1);
    },
    update: vi.fn(() => Promise.resolve()),
  };
  return {
    registration,
    listenerCount: () => updateFoundListeners.length,
    found: () => {
      for (const fn of updateFoundListeners) fn();
    },
  };
}

/** node 环境没有 SW / location:stub 掉再跑,收尾还原 */
function stubBrowser(controller: ServiceWorker | null) {
  vi.stubGlobal("navigator", { serviceWorker: { controller } });
  const reload = vi.fn();
  vi.stubGlobal("location", { reload });
  return { reload };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useServiceWorkerUpdate · 首次安装不提示", () => {
  it("controller 为空(页面没被 SW 接管过):installed 也不调 onUpdate", () => {
    stubBrowser(null);
    const installing = makeInstalling();
    const { registration, found } = makeRegistration(installing);
    const onUpdate = vi.fn();
    useServiceWorkerUpdate(registration as unknown as ServiceWorkerRegistration, onUpdate);
    found();
    installing.setState("installing");
    installing.setState("installed");
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("useServiceWorkerUpdate · 更新提示", () => {
  it("controller 非空 + 新脚本装到 installed:onUpdate 恰好一次", () => {
    stubBrowser({} as ServiceWorker);
    const installing = makeInstalling();
    const { registration, found } = makeRegistration(installing);
    const onUpdate = vi.fn();
    useServiceWorkerUpdate(registration as unknown as ServiceWorkerRegistration, onUpdate);
    found();
    installing.setState("installed");
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("state 中间态(installing)不触发;首次 installed 触发一次", () => {
    stubBrowser({} as ServiceWorker);
    const installing = makeInstalling();
    const { registration, found } = makeRegistration(installing);
    const onUpdate = vi.fn();
    useServiceWorkerUpdate(registration as unknown as ServiceWorkerRegistration, onUpdate);
    found();
    installing.setState("installing");
    expect(onUpdate).not.toHaveBeenCalled();
    installing.setState("installed");
    expect(onUpdate).toHaveBeenCalledTimes(1);
    // 边界现状:同一次 statechange 若重复派发 installed,handleInstallerState
    // 不去重、onUpdate 会再调 —— 浏览器的 statechange 只在真实状态跃迁时派发,
    // installed 天然只来一次,故不算违约;此处记录现状,防后人误以为有去重守卫。
    installing.setState("installed");
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("stop() 之后才装好的新版本:不再提示", () => {
    stubBrowser({} as ServiceWorker);
    const installing = makeInstalling();
    const { registration, found } = makeRegistration(installing);
    const onUpdate = vi.fn();
    const handle = useServiceWorkerUpdate(
      registration as unknown as ServiceWorkerRegistration,
      onUpdate,
    );
    found();
    handle.stop();
    installing.setState("installed");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("stop() 之后再来的 updatefound:同样不提示", () => {
    stubBrowser({} as ServiceWorker);
    const first = makeInstalling();
    const second = makeInstalling();
    const { registration, found } = makeRegistration(first);
    const onUpdate = vi.fn();
    const handle = useServiceWorkerUpdate(
      registration as unknown as ServiceWorkerRegistration,
      onUpdate,
    );
    found();
    handle.stop();
    // 第二个 installing:换掉 registration.installing 再派发一次 updatefound
    (registration as { installing: unknown }).installing = second.worker;
    found();
    second.setState("installed");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("stop() 会解绑 updatefound 与当前 installing 的 statechange", () => {
    stubBrowser({} as ServiceWorker);
    const installing = makeInstalling();
    const { registration, found, listenerCount } = makeRegistration(installing);
    const handle = useServiceWorkerUpdate(
      registration as unknown as ServiceWorkerRegistration,
    );
    found();
    expect(listenerCount()).toBe(1);
    expect(installing.listenerCount()).toBe(1);
    handle.stop();
    expect(listenerCount(), "registration 上不该再留 updatefound 闭包").toBe(0);
    expect(installing.listenerCount(), "worker 上不该再留 statechange 闭包").toBe(0);
    handle.stop();
    expect(listenerCount()).toBe(0);
  });

  it("换上新 installing 时先解绑旧 worker,监听不随更新次数累积", () => {
    stubBrowser({} as ServiceWorker);
    const first = makeInstalling();
    const second = makeInstalling();
    const { registration, found } = makeRegistration(first);
    useServiceWorkerUpdate(registration as unknown as ServiceWorkerRegistration);
    found();
    (registration as { installing: unknown }).installing = second.worker;
    found();
    expect(first.listenerCount()).toBe(0);
    expect(second.listenerCount()).toBe(1);
  });
});

describe("useServiceWorkerUpdate · reload()", () => {
  it("waiting 在:补发 SKIP_WAITING 后重载", () => {
    const { reload } = stubBrowser({} as ServiceWorker);
    const { registration } = makeRegistration(null);
    const waiting = { postMessage: vi.fn() };
    registration.waiting = waiting as unknown as ServiceWorker;
    const handle = useServiceWorkerUpdate(
      registration as unknown as ServiceWorkerRegistration,
    );
    handle.reload();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waiting 空、installing 在:对 installing 补发", () => {
    const { reload } = stubBrowser({} as ServiceWorker);
    const installing = makeInstalling();
    const { registration } = makeRegistration(installing);
    const handle = useServiceWorkerUpdate(
      registration as unknown as ServiceWorkerRegistration,
    );
    handle.reload();
    expect(installing.worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("两者皆空(更新早已接完):不 postMessage,照常重载", () => {
    const { reload } = stubBrowser(null);
    const { registration } = makeRegistration(null);
    const handle = useServiceWorkerUpdate(
      registration as unknown as ServiceWorkerRegistration,
    );
    expect(() => handle.reload()).not.toThrow();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("postMessage 抛错(目标 worker 已被顶掉):重载不受影响", () => {
    const { reload } = stubBrowser({} as ServiceWorker);
    const { registration } = makeRegistration(null);
    const waiting = {
      postMessage: vi.fn(() => {
        throw new DOMException("No active worker");
      }),
    };
    registration.waiting = waiting as unknown as ServiceWorker;
    const handle = useServiceWorkerUpdate(
      registration as unknown as ServiceWorkerRegistration,
    );
    handle.reload();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("useServiceWorkerUpdate · 检测容错", () => {
  it("registration.update() 拒绝:吞掉,不向外抛未处理拒绝", async () => {
    stubBrowser(null);
    const { registration } = makeRegistration(null);
    registration.update = vi.fn(() => Promise.reject(new Error("离线")));
    expect(() =>
      useServiceWorkerUpdate(registration as unknown as ServiceWorkerRegistration),
    ).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });

  it("注册完成后主动要求检测一次(update 被调)", () => {
    stubBrowser(null);
    const { registration } = makeRegistration(null);
    useServiceWorkerUpdate(registration as unknown as ServiceWorkerRegistration);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });
});
