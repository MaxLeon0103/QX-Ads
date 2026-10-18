/*
 * QX 广告创意跳过注入 · v1 (2026-10-18)
 * ================================================
 * 原理：Airlines Manager 的 App Store 类广告（试玩/视频创意）本体是
 *   HTTPS 传输的 HTML/JS：
 *     - cdn-creatives-cf-prd.acquire.unity3dusercontent.com (Unity 创意 HTML)
 *     - res1.applovin.com (Vungle-under-MAX 创意 JS 加载器)
 *   QX 用 script-response-body 向其中注入本脚本，定时探测创意自身的
 *   "结束广告"JS 桥（MRAID / Vungle DAPI / ExitAPI / webkit bridge），
 *   命中即提前关闭广告。游戏侧奖励发放不依赖创意完成（HAR 已证实）。
 *
 * 用法（[rewrite_local]）：
 *   ^https?:\/\/cdn-creatives-cf-prd\.acquire\.unity3dusercontent\.com\/assets\/.*\.html url script-response-body <本文件路径>
 *   ^https?:\/\/res1\.applovin\.com\/.*js_load\.js url script-response-body <本文件路径>
 * 同时把两个域名加入 [mitm] hostname。
 * ================================================
 */

const SKIP_AFTER_MS = 3000; // 注入后 3 秒开始尝试关闭
const MAX_TRIES = 15;       // 每秒探测一次，共 15 秒

function buildPayload() {
  return (
    '<script>(function(){' +
    'var LOG=function(m){try{console.log("[AD-SKIP] "+m)}catch(e){}};' +
    'var T0=Date.now();' +
    'function closeIt(){' +
    'try{if(window.mraid&&typeof mraid.close==="function"){mraid.close();LOG("mraid.close() ok");return true}}catch(e){LOG("mraid err "+e)}' +
    'try{if(window.vungle&&typeof window.vungle.close==="function"){window.vungle.close();LOG("vungle.close() ok");return true}}catch(e){}' +
    'try{if(window.applovin&&typeof window.applovin.close==="function"){window.applovin.close();LOG("applovin.close() ok");return true}}catch(e){}' +
    'try{if(window.ExitAPI&&typeof window.ExitAPI.close==="function"){window.ExitAPI.close();LOG("ExitAPI.close() ok");return true}}catch(e){}' +
    'try{if(window.webkit&&window.webkit.messageHandlers){' +
    'var n=Object.keys(window.webkit.messageHandlers).join(",");' +
    'if(n){LOG("webkit handlers: "+n)}}}catch(e){}' +
    'try{var sels=[".close-button","[class*=close]","[id*=close]","[aria-label*=lose]","[data-action=close]","button.skip"];' +
    'for(var i=0;i<sels.length;i++){var el=document.querySelector(sels[i]);' +
    'if(el){el.click();LOG("clicked: "+sels[i]);return true}}}catch(e){}' +
    'return false}' +
    'var tries=' + MAX_TRIES + ';' +
    'function loop(){' +
    'LOG("probe @"+Math.round((Date.now()-T0)/1000)+"s");' +
    'if(closeIt()){LOG("CLOSED");return}' +
    'if(--tries>0){setTimeout(loop,1000)}else{LOG("give up: no bridge found")}}' +
    'setTimeout(loop,' + SKIP_AFTER_MS + ');' +
    '})()</script>'
  );
}

const url = $request.url;
let body = $response.body || '';

if (body.length < 500) {
  // 太小的不处理（探活/空响应）
  $done({});
}

if (/\.html?($|\?)/i.test(url) || /<html/i.test(body.substring(0, 200))) {
  // HTML 创意：优先插到 </body> 前，否则直接前置（浏览器照样执行）
  const payload = buildPayload();
  if (body.lastIndexOf('</body>') !== -1) {
    const idx = body.lastIndexOf('</body>');
    body = body.slice(0, idx) + payload + body.slice(idx);
  } else {
    body = payload + body;
  }
  console.log('[AD-SKIP] injected into HTML: ' + url.substring(0, 80));
} else {
  // JS 加载器（res1.applovin.com/...js_load.js 等）：把探测代码转为纯 JS 前置
  let js = buildPayload()
    .replace('<script>', '')
    .replace('</script>', '');
  // JS 文件里没有 document 前探测也没关系，query 抛错会被 try 吞掉
  body = js + '\n' + body;
  console.log('[AD-SKIP] injected into JS: ' + url.substring(0, 80));
}

$done({ body: body });