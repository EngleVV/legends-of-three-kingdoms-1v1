// 图标生成：用项目自带的 Electron(Chromium) 把 assets/icon.svg 渲染成多尺寸 PNG，并合成 Windows .ico
// 用法：npx electron tests/make-icon.mjs
// 产物：icon.ico（Windows）、icon-256.png（Linux 窗口图标）、icon-32.png、icon-mac-512.png（macOS Dock，带规范边距）
// 说明：Windows 常有 125%/150% 显示缩放，直接逐尺寸截图会得到翻倍像素；
// 因此只渲染一次 512 大图，再用 NativeImage.resize 精确缩到各档尺寸。
import { app, BrowserWindow } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(join(ROOT, 'assets/icon.svg'));
// 透明底：图标是圆角方形，圆角外必须透明，否则各平台都会露出白色方角
const page = Buffer.from(
  `<!doctype html><html><head><style>*{margin:0}html,body{background:transparent}
img{display:block;width:100vw;height:100vh}</style></head>
<body><img src="data:image/svg+xml;base64,${svg.toString('base64')}"></body></html>`
).toString('base64');
const html = `data:text/html;base64,${page}`;

// macOS 版：图标规范要求主体四周留透明边距（1024 画布主体 824，约 80.5%），
// 否则 Dock 里会比其它应用图标大一圈
const MAC_SCALE = 824 / 1024;

// Windows .ico 各档尺寸（256 在目录项里以 0 表示）
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const RENDER = 512; // 高分辨率源图，向下缩放保证小尺寸清晰

// 看门狗：任何一步卡住都强制退出，避免挂死终端
setTimeout(() => { console.error('图标生成超时'); app.exit(1); }, 60_000).unref?.();

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: RENDER, height: RENDER, show: false, frame: false,
      transparent: true, backgroundColor: '#00000000',
      webPreferences: { offscreen: true },
    });
    await win.loadURL(html);
    const capture = async () => {
      await win.webContents.executeJavaScript(
        'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      await delay(50);
      let img = await win.webContents.capturePage({ x: 0, y: 0, width: RENDER, height: RENDER });
      if (img.isEmpty()) throw new Error('capturePage 得到空图');
      if (img.getSize().width !== RENDER) img = img.resize({ width: RENDER, height: RENDER, quality: 'best' });
      return img;
    };
    const big = await capture();

    // macOS Dock 图标：同一窗口缩小主体、居中留边后再截一次
    const pad = (1 - MAC_SCALE) / 2 * 100;
    await win.webContents.executeJavaScript(`Object.assign(document.querySelector('img').style,
      { width: '${MAC_SCALE * 100}vw', height: '${MAC_SCALE * 100}vh', margin: '${pad}vh auto 0' })`);
    writeFileSync(join(ROOT, 'assets/icon-mac-512.png'), (await capture()).toPNG());
    win.destroy();

    const pngs = new Map();
    for (const size of SIZES) {
      const img = big.getSize().width === size ? big : big.resize({ width: size, height: size, quality: 'best' });
      const buf = img.toPNG();
      if (img.getSize().width !== size) throw new Error(`缩放尺寸异常: 期望 ${size}，得到 ${img.getSize().width}`);
      pngs.set(size, buf);
      if (size === 256) writeFileSync(join(ROOT, 'assets/icon-256.png'), buf);
      if (size === 32) writeFileSync(join(ROOT, 'assets/icon-32.png'), buf);
    }

    // 合成 ICO：目录头 + 每尺寸一个目录项 + PNG 数据（Vista+ 支持内嵌 PNG）
    const count = SIZES.length;
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);           // reserved
    header.writeUInt16LE(1, 2);           // type: icon
    header.writeUInt16LE(count, 4);       // entry count

    const entries = [];
    const blobs = [];
    let offset = 6 + 16 * count;
    for (const size of SIZES) {
      const data = pngs.get(size);
      const entry = Buffer.alloc(16);
      entry.writeUInt8(size >= 256 ? 0 : size, 0);  // width
      entry.writeUInt8(size >= 256 ? 0 : size, 1);  // height
      entry.writeUInt8(0, 2);             // palette
      entry.writeUInt8(0, 3);             // reserved
      entry.writeUInt16LE(1, 4);          // planes
      entry.writeUInt16LE(32, 6);         // bpp
      entry.writeUInt32LE(data.length, 8);
      entry.writeUInt32LE(offset, 12);
      offset += data.length;
      entries.push(entry);
      blobs.push(data);
    }

    const ico = Buffer.concat([header, ...entries, ...blobs]);
    writeFileSync(join(ROOT, 'assets/icon.ico'), ico);
    console.log(`已生成 assets/icon.ico（${count} 档尺寸，${ico.length} 字节）+ icon-256.png + icon-32.png + icon-mac-512.png`);
    app.exit(0);
  } catch (e) {
    console.error('图标生成失败：', e.message);
    app.exit(1);
  }
});
