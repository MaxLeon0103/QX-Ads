/*
 * QX 广告创意跳过注入 · v2 (2026-10-19)
 * ================================================
 * 改进（相对 v1）：
 *  1. 只在响应体确实是 HTML 文档时注入（避免把 <script> 插进被当作
 *     JS 执行的内容里导致创意加载失败——v1 疑似因此弄坏了试玩广告）
 *  2. 探测结果通过 Image() 信标回传（new Image().src 到同域一个假路径，
 *     失败无妨）——能在 QX「网络活动」里直接看到：/__adskip?v=...
 *     （v1 用 console.log，广告 WebView 的输出 QX 收不到，是盲的）
 *  3. 探测更全：MRAID / Vungle DAPI / ExitAPI / webkit 桥 / 关闭按钮，
 *     并在发现桥之前先打一次「环境快照」信标
 *
 * 用法（[rewrite_local]，两条同 v1）：
 *  ^https?:\/\/cdn-creatives-cf-prd\.acquire\.unity3dusercontent\.com\/assets\/.*\.html url script-response-body <本文件>
 *  ^https?:\/\/res1\.applovin\.com\/.*\.js url script-response-body <本文件>
 * ================================================
 */

function buildPayload() {
  return '<script>(function(){' +
    'var P=function(t){try{new Image().src="https://res1.applovin.com/__adskip?v="+encodeURIComponent(t).substring(0,300)}catch(e){}};' +
    'var T0=Date.now();' +
    'function snap(){var f=[];try{for(var k in window){if(/mraid|vungle|applovin|exitapi|dapi|adcolony/i.test(k))f.push(k)}}catch(e){}' +
    'try{if(window.webkit&&window.webkit.messageHandlers)f.push("WK:"+Object.keys(window.webkit.messageHandlers).join("|"))}catch(e){}' +
    'return f.join(",")||"none"}' +
    'function closeIt(){' +
    'try{if(window.mraid&&typeof window.mraid.close==="function"){window.mraid.close();P("ok:mraid");return 1}}catch(e){}' +
    'try{if(window.vungle&&typeof window.vungle.close==="function"){window.vungle.close();P("ok:vungle");return 1}}catch(e){}' +
    'try{if(window.ExitAPI&&typeof window.ExitAPI.close==="function"){window.ExitAPI.close();P("ok:exitapi");return 1}}catch(e){}' +
    'try{if(window.dapi&&typeof window.dapi.close==="function"){window.dapi.close();P("ok:dapi");return 1}}catch(e){}' +
    'try{if(window.applovin&&typeof window.applovin.close==="function"){window.applovin.close();P("ok:applovin");return 1}}catch(e){}' +
    'try{if(window.mraid&&typeof window.mraid.addEventListener==="function"){P("mraid-state:"+window.mraid.getState())}}catch(e){}' +
    'var sels=["[class*=close]","[id*=close]","[class*=skip]","[id*=skip]","[aria-label*=lose]","button.skip",".close-button"];' +
    'for(var i=0;i<sels.length;i++){try{var el=document.querySelector(sels[i]);if(el){el.click();P("click:"+sels[i]);return 1}}catch(e){}}' +
    'return 0}' +
    'var tries=18;P("boot:"+snap());' +
    'function loop(){var d=Date.now()-T0;' +
    'if(closeIt()){P("closed@"+d+"ms");return}' +
    'if(--tries>0){setTimeout(loop,1000)}else{P("giveup:"+snap())}}' +
    'setTimeout(loop,3000);' +
    '})()</script>';
}

const url = $request.url;
let body = $response.body || '';

// 只对真正的 HTML 文档注入；其余（真 JS / 二进制 / 空响应）原样放行
if (!/^\s*(<!doctype html|<html)/i.test(body.substring(0, 200))) {
  console.log('[AD-SKIP] skip (not HTML doc): ' + url.substring(0, 80));
  $done({});
}

if (body.length < 1000) {
  $done({});
}

const payload = buildPayload();
if (body.lastIndexOf('</body>') !== -1) {
  const idx = body.lastIndexOf('</body>');
  body = body.slice(0, idx) + payload + body.slice(idx);
} else {
  body = body + payload;
}
console.log('[AD-SKIP] injected v2 into HTML: ' + url.substring(0, 80));
$done({ body: body });