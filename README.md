# 拼豆图纸生成器

微信原生小程序，使用 WXML、WXSS、JavaScript 和 Canvas 2D。图片转换在手机本地进行，无登录、服务器或发布服务依赖。

**当前已实现完整工程和自动化测试，但尚未验收用户原始小狗图片，也未经过微信开发者工具或真机测试。** 当前只有演示色卡，不能据此购买品牌拼豆。详见 [测试报告](docs/TEST_REPORT.md)。

## 导入微信开发者工具

1. 解压交付 ZIP，选择含 `project.config.json` 的根目录导入，不要只导入 `pages`。
2. `miniprogramRoot` 为 `miniprogram/`；建议基础库 3.7.0 或更高。
3. `touristappid` 用于本地工程检查。手机预览、保存相册及发布时换成自己的合法 AppID，并在微信后台配置隐私声明。源码没有真实 AppID。
4. 小程序运行不需要 npm 构建或服务器域名。npm 仅用于桌面自动化测试。
5. 拍照或选相册图片后自动生成 52×52。切换 78/104/120 或优化模式自动重生成；点击图纸放大查看。

## 目录

```text
project.config.json           开发者工具项目入口
miniprogram/app.*             小程序入口及全局样式
miniprogram/pages/index/      图片选择、尺寸/模式、预览、保存
miniprogram/utils/image.js    全图重采样、透明度合成、局部轮廓保护
miniprogram/utils/color.js    sRGB/线性光/OKLab、感知距离、文字对比色
miniprogram/utils/palette.js  唯一色卡配置入口（没有管理界面）
miniprogram/utils/pattern.js  配色、可选照片抖动、豆位和统计
miniprogram/utils/render.js   网格、坐标、色号、边框、颜色标签
miniprogram/utils/wx-canvas.js 图片加载及 Canvas 2D 桥接
miniprogram/utils/export.js   顺序分区导出、相册保存、错误反馈
tests/                        算法与模拟微信 API 工作流测试
tools/                        素材夹具、真实 PNG 渲染、工程检查、打包
docs/                         测试报告、真机清单
artifacts/synthetic/           合成犬类夹具实际输出（非用户原图）
```

## 色卡修改

替换 `miniprogram/utils/palette.js` 中的 `palette` 和 `metadata`：

```js
const palette = [
  { code: 'A01', hex: '#FFFFFF' },
  { code: 'A02', hex: '#F2E8DC' }
];
const metadata = { name: '你的品牌与版本', isDemo: false, description: '注明可靠色值来源和测量条件' };
module.exports = { palette, metadata };
```

以上只示意格式，不代表品牌真实色号。支持 1–512 色，色号唯一并符合 `[A-Z][A-Z0-9]{1,7}`，颜色为六位 HEX。匹配只用色值，编号字母不决定颜色。可在开发阶段将品牌 JSON 转为此 JS 配置；客户端无色卡管理、录入、导入或编辑界面。

当前演示色卡有 104 个明确列出的色值；D001 等仅为演示编号，非品牌色号。品牌资料未提供，真实实物配色尚未验收。实际使用请替换为可靠的品牌资料或校准测量值。

## 图像算法

- 默认完整画幅等比适配，不中心裁剪、不拉伸。空余补白；透明 PNG 在线性光空间先合成白底，无效透明 RGB 不参与着色。背景白豆也计入总数。
- 微信桥接工作图最长边 1024；核心 JS 在目标网格精确面积积分。照片用线性光重采样，避免不正确的亮度混合。
- 插画混合线性光/感知亮度，再对高对比像素足迹施加有界深色覆盖权重，保留细线；不直接复制单个最暗像素。此策略根据实际合成 PNG 轮廓变浅问题调优，不代表用户原图已验收。
- 有界局部锐化只调整亮度并保持通道比例，不直接增强鼻头饱和度。独立一个豆位的眼睛高光不做多数滤波。
- OKLab 最近色匹配适度加强色度权重，避免灰粉误配成饱和红；不根据鼻头位置写死颜色，也不产生色卡以外颜色。
- 自动模式根据透明度和采样色彩复杂度进行启发式判断，可手动选插画/照片。照片可开启受边缘约束的低强度蛇形 Floyd–Steinberg 抖动，默认关闭以控制杂色。
- 分批异步处理并支持取消，快速切换只保留最新结果。

有限网格无法可靠还原小于一颗豆位的文字或毛发；不能用代码成功或合成素材证明任意图片达到成熟工具质量。

## PNG 导出

带号图每格完整色号、自动明暗字色、棕色边框、四周首尾/每 10 格坐标、数量降序紧凑色卡。无字图保留网格/坐标/色卡，格内无字。

手机带号每格 28px：52 单张、78 分为 4 张 39×39、104 分为 4 张 52×52、120 分为 9 张 40×40。色卡过多则进一步分区。无字图每格 12px，通常单张，必要时分区。分区为全图坐标，图例统计本分区用量；各区用量之和等于全图。

每个画布不超过 2048×2048，顺序绘制，等待绘制帧，导出后释放 backing store。可查看 PNG 后选择保存全部到相册；拒绝权限或部分失败时反馈已保存张数，保留已导出文件。

桌面完整 `sheet-100-offline.png`、`sheet-120-offline.png` 是检查用途，手机不会分配这些大画布。手机路径已在模拟 API 中产生真实 PNG，但微信 Canvas 内存、时序和相册接口尚待 Android/iOS 验证。

## 测试及实际渲染

```bash
npm ci
npm test
npm run visual
npm run pack
```

测试环境 Node.js 24.19.0。桌面依赖 `@napi-rs/canvas`，小程序不引用它。依赖由 `package-lock.json` 固定。

`visual` 默认生成明确标记的合成犬类夹具：四个正式尺寸、内部100、桌面完整带号图、120分区、基础 RGB 对照和照片模式。输出在 `artifacts/synthetic/`。基础对照不是成熟软件或旧项目算法。

收到真实素材后运行：

```bash
node tools/visual.js --input /path/to/dog.png --reference /path/to/reference.png --out /path/to/results
```

工具使用与手机相同的 JS 核心。参考图并排显示；含边框/图例时须对齐实际豆位，不能直接拿整图误差当质量指标。真实色卡也需同步替换。

测试包含算法、统计、API 模拟工作流、尺寸竞态、JPG 解码、实际 PNG 编码、相册失败及 JS/JSON/页面/事件引用检查，不能替代微信编译或真机验收。

## 旧项目恢复

原提交 `97668779a5b8af8158c1cf11caa1f3ec09990faa` 已推送至 `archive/legacy-project`。新分支 `feature/bead-miniapp`。先保存本地更改，再恢复：

```bash
git fetch origin archive/legacy-project
git switch archive/legacy-project
```

云工作区另有 `/workspace/backups/tween-legacy.bundle` 完整 Git 历史和 `/workspace/backups/tween-legacy-files.tar.gz` 旧文件/依赖备份，不放入小程序交付包。

## 未完成的验收

- 小狗原图和成熟软件100参考图未提供，指定五官、毛发、问号、爪印的视觉验收待做。合成图只证明特定性质和可检查的渲染链路。
- 真实品牌色卡未提供，实物准确配色待验收。
- 微信开发者工具与 Android/iOS 真机未运行；EXIF、相机、隐私授权、Canvas内存、缩放、相册权限等待测。
- 详见 [真机清单](docs/DEVICE_CHECKLIST.md)。通过后才应称为已验收的日常可用版本。
