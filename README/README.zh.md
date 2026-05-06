<h1 align="center">
  <img src="../electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://gist.githubusercontent.com/Cynacedia/30c5da7160619ca08933e7e3e92afcc3/raw/downloads-badge.svg" alt="Downloads" />
  </a>
</p>
<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.zh.md">中文（简体）</a> |
  <a href="README.pt.md">Português</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.nl.md">Nederlands</a>
</p>
一款一体化的 VRChat 活动创建工具，告别重复配置。
为每个群组创建并保存活动模板，通过简单的周期规则生成即将到来的活动日期列表，并一键自动填充详情。适合快速安排每周聚会、观影会和社区活动。


<p align="center">
  <img src=".imgs/1MP-CE_CreationFlow-01-05-26.gif" width="900" alt="活动创建流程（模板到发布）" />
</p>


## 模板与原生系列，怎么选

VRChat 自带了原生的周期性活动（系列）功能，适合稳定重复举行的活动。一旦创建了系列，VRChat 就会自行维持，无需保持本应用运行；并且整个系列的通知只会在创建时发出一次。在 VRChat 中编辑正在进行的系列，通常需要先删除再重新创建，而本应用会在你修改日程时自动完成这一步，所以编辑起来跟普通编辑没有差别。需要注意的是，系列没有按场次推送通知的能力，事后再修改个别场次时，社区成员可能不会留意到。

模板的工作方式则不同。核心流程仍然是手动的：你逐个创建活动，由模板帮你自动填好表单内容，免去每次重新输入的麻烦。在此基础上，启用可选的自动化后，应用会按计划继续发布后续的活动，每一次都附带独立的通知，让群组成员能提前知道有新的活动即将到来。如果你提前修改了待发布的活动，改动会随通知一起在发布时同步出去，这样临时的调整也不会被错过。需要注意的是，自动发布需要保持应用处于运行状态。

两种方式都集中在同一个 **「日程管理」** 标签页中，可以根据活动的性质灵活选择，也可以在同一群组中两者并用。

## 功能
- 按群组的模板，一键自动填充活动详情（可选启用按计划自动发布）。
- 周期规则生成器：给出即将到来的活动日期列表，也可手动输入日期/时间。
- 支持 VRChat 原生系列，可与模板并行使用。
- 活动自动化：在应用运行时，根据模板规则自动发布后续活动。
- 即将到来的活动编辑视图（网格 + 编辑弹窗，支持筛选与时间范围调整）。
- 群组日历活动创建向导。
- 主题工作室，内置预设并支持完整界面配色（支持 #RRGGBBAA）。
- 本地化与首次启动语言选择（en, fr, es, de, ja, zh, pt, ko, ru, nl）。
- 图库选择与图片 ID 上传。
- 开机自启 + 最小化到系统托盘。
- 单实例保护，防止重复启动。

### 可选集成（高级选项）

默认未启用，每项都需要单独配置。配置完成后，可在每个模板和每个活动上独立切换：

- **Discord：** 在创建 VRChat 活动的同时，自动创建 Discord 预定活动。需要先创建 Discord 机器人并邀请到你的服务器。（[配置指南](Discord%20Setup/DISCORD_SETUP.zh.md)）
- **日历：** 生成带提醒的 `.ics` 文件，可通过 Discord webhook 投递，或自动保存到本地。（[配置指南](Calendar%20Setup/CALENDAR_SETUP.zh.md)）
- **EC Kit**（付费许可）：按群组自定义 webhook 的显示名称、头像和嵌入颜色，并支持按活动添加自定义消息与图片附件。（[Ko-fi](https://ko-fi.com/s/0735ce5375) · [许可证](https://eckit.cynacedia.dev/license/v1.0)）

## 下载
- 发布版：https://github.com/Cynacedia/VRC-Event-Creator/releases

## 隐私与数据存储
不会存储你的密码，仅缓存会话令牌。
应用文件存放在 Electron 用户数据目录中（在 设置 > 应用信息 中可查看）：

- `profiles.json`（活动模板与各群组的集成配置）
- `series.json`（本地记录的 VRChat 原生系列）
- `cache.json`（会话令牌）
- `settings.json`（应用设置）
- `themes.json`（主题预设与自定义颜色）
- `pending-events.json`（自动化队列）
- `automation-state.json`（自动化跟踪）
- `pending-rasterize.json`（因频率限制而排队等待重试的系列创建任务）

你可以通过环境变量 `VRC_EVENT_DATA_DIR` 指定数据目录。
首次启动时，应用会尝试从项目目录导入现有的 `profiles.json`。

机器人令牌（用于 Discord 集成）和 webhook URL 都使用操作系统的安全存储进行加密保存，仅会发送至 Discord API 或你指定的 webhook URL，不会发送到任何其他地方。

__**不要分享缓存文件或应用数据文件夹。**__

## 使用说明
- 模板需要填写日程名称、活动名称和描述。
- 私有群组只能选择访问类型 = 群组。
- 活动时长格式为 DD:HH:MM，最长 31 天。
- 标签最多 5 个，语言最多 3 个。
- 图库上传限制：PNG/JPG、64-2048 px、文件小于 10 MB、每个账号最多 64 张。
- VRChat 限制每小时每人每群组创建 10 个活动。
- 用模板自动发布活动需要应用保持运行；系列一旦创建后，由 VRChat 自行处理。
- Featured Event 等特殊开关需要特定的群组权限；仅在允许时显示。

## 故障排查
- **登录问题：** 删除 `cache.json` 后重新登录（使用设置 > 应用信息中显示的数据目录）。
- **找不到群组：** 你的账号需要在目标群组中具备日历访问权限。如果刚刚在 VRChat 那边调整过权限，点击状态栏的 **「重新同步」** 按钮即可刷新群组列表。
- **频率限制：** VRChat 可能限制活动创建。请等待并重试，多次失败时停止操作，不要反复点击刷新或创建按钮。
- **系列创建被暂停：** 当 VRChat 频率限制阻止系列创建时，应用会自动重试。日程管理标签会显示下一次重试时间，也提供了「立即重试」按钮，方便你不想等待时手动触发。
- **更新：** 有更新待处理时，部分功能会被限制。请下载并运行最新版本。

## 免责声明
- 本项目与 VRChat 无关，也未获得其认可。请自行承担风险。
- 语言为机器翻译，可能不准确，欢迎提交修正。

## 要求（从源代码构建）
- Node.js 20+（推荐 22.21.1）
- npm
- 拥有至少一个群组活动创建权限的 VRChat 账号

---

## 鸣谢
- [🌸potato🌸](https://x.com/potatovrc)，日语翻译
- Garvas，法语翻译
- Sometsuki，葡萄牙语翻译
- [GitHub 上的所有贡献者](https://github.com/Cynacedia/VRC-Event-Creator/graphs/contributors)
