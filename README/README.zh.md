<h1 align="center">
  <img src="../electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://img.shields.io/github/downloads/Cynacedia/VRC-Event-Creator/total?style=plastic&labelColor=555&color=blue" alt="Downloads" />
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
  <a href="README.ru.md">Русский</a>
</p>
一体化的 VRChat 活动创建工具，消除重复的设置流程。
创建并保存按群组区分的活动模板，从简单的重复模式生成即将到来的日期，并即时自动填充详情 - 非常适合快速安排每周聚会、观影会和社区活动。

## 截图
<table>
  <tr>
    <td align="center">
      <img src=".imgs/1MP-Basics-Screenshot%202026-01-02%20230956.png" width="300" alt="资料：模板" />
      <br />
      资料：模板
    </td>
    <td align="center">
      <img src=".imgs/2MP-Schedule-Screenshot%202026-01-02%20231523.png" width="300" alt="资料：排期规则" />
      <br />
      资料：排期规则
    </td>
    <td align="center">
      <img src=".imgs/3CE-ProfileSelect-Screenshot%202026-01-02%20231634.png" width="300" alt="创建：选择资料" />
      <br />
      创建：选择资料
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src=".imgs/4CE-DateSelect-Screenshot%202026-01-02%20231805.png" width="300" alt="创建：选择日期" />
      <br />
      创建：选择日期
    </td>
    <td align="center">
      <img src=".imgs/5CE-Review-Screenshot%202026-01-02%20231907.png" width="300" alt="创建：确认并提交" />
      <br />
      创建：确认并提交
    </td>
    <td align="center">
      <img src=".imgs/6S-ThemeStudio-Screenshot%202026-01-02%20232221.png" width="300" alt="主题工作室：自定义界面" />
      <br />
      主题工作室：自定义界面
    </td>
  </tr>
</table>

## 下载
- GitHub Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases
- Windows 便携版 `.exe` 可独立运行（运行不需要 Node.js）。
- 应用数据存储在标准的 Electron 用户数据目录中（在 设置 > 应用信息 中显示），除非通过 `VRC_EVENT_DATA_DIR` 覆盖。

## 功能
- 按组自动填充活动详情的资料/模板。
- 重复模式生成器：提供即将到来的日期列表，并可手动输入日期/时间。
- 群组日历活动创建向导。
- 即将到来的活动编辑视图（网格 + 编辑弹窗）。
- 主题工作室与预设，完整的界面配色控制（支持 #RRGGBBAA）。
- 图片 ID 的图库选择与上传。
- 首启语言选择的本地化（en, fr, es, de, ja, zh, pt, ko, ru）。

## 隐私与数据存储
不会存储你的密码，只会缓存会话令牌。
应用文件存储在 Electron 用户数据目录中（在 设置 > 应用信息 中显示）：

- `profiles.json`（配置文件模板）
- `cache.json`（会话令牌）
- `settings.json`（联系邮箱）
- `themes.json`（主题预设和自定义颜色）

你可以通过环境变量 `VRC_EVENT_DATA_DIR` 覆盖数据目录。
首次启动时，应用会尝试从项目文件夹导入现有的 `profiles.json`。

__**不要分享缓存文件或应用数据文件夹。**__

## 使用说明
- 继续前需要填写资料名称、活动名称和描述。
- 首次启动需提供联系人邮箱以使用 VRChat API。
- 私有群组只能使用访问类型 = 群组。
- 时长使用 DD:HH:MM，最大 31 天。
- 标签最多 5 个，语言最多 3 个。
- 图库上传限制：PNG/JPG、64-2048 px、小于 10 MB、每个账号最多 64 张。
- VRChat 目前每次最多允许 10 个即将到来的活动。

## 更新
- 启动时检查，运行期间每小时检查一次。
- 有新版本时，UPDATE 会链接到 GitHub 仓库。
- 显示 UPDATE 时将阻止创建和编辑活动。
- 无自动更新；请在此下载最新的 `.exe` 手动更新：https://github.com/Cynacedia/VRC-Event-Creator/releases。

## 故障排查
- 登录问题：删除 `cache.json` 后重新登录（使用应用信息中显示的数据文件夹）。
- 找不到组：你的账号需要在目标组中具备日历访问权限。
- 频率限制：VRChat 可能限制活动创建。请等待并重试，多次失败时停止操作。不要反复点击刷新或创建活动按钮。

## 翻译
*翻译为机器翻译，可能不准确，欢迎提交修正。
- English：../README.md
- Français：README.fr.md
- Español：README.es.md
- Deutsch：README.de.md
- 日本語：README.ja.md
- 中文（简体）：README.zh.md
- Português：README.pt.md
- 한국어：README.ko.md
- Русский：README.ru.md

## 免责声明
本项目与 VRChat 无关，也未获得 VRChat 的认可。使用风险自负。

## 要求（从源代码构建）
- Node.js 20+（推荐 22.21.1）
- npm
- 拥有至少一个组的活动创建权限的 VRChat 账号