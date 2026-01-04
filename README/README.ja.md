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
VRChat向けのオールインワンなイベント作成ツールで、繰り返しの設定作業をなくします。
グループごとのイベントテンプレートを作成・保存し、シンプルな繰り返しパターンから今後の日程を生成して詳細を即時に自動入力 - 週次の集まり、視聴会、コミュニティイベントを素早くスケジュールするのに最適です。

## スクリーンショット
<table>
  <tr>
    <td align="center">
      <img src=".imgs/1MP-Basics-Screenshot%202026-01-02%20230956.png" width="300" alt="プロフィール：テンプレート" />
      <br />
      プロフィール：テンプレート
    </td>
    <td align="center">
      <img src=".imgs/2MP-Schedule-Screenshot%202026-01-02%20231523.png" width="300" alt="プロフィール：スケジュール規則" />
      <br />
      プロフィール：スケジュール規則
    </td>
    <td align="center">
      <img src=".imgs/3CE-ProfileSelect-Screenshot%202026-01-02%20231634.png" width="300" alt="作成：プロフィール選択" />
      <br />
      作成：プロフィール選択
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src=".imgs/4CE-DateSelect-Screenshot%202026-01-02%20231805.png" width="300" alt="作成：日付を選択" />
      <br />
      作成：日付を選択
    </td>
    <td align="center">
      <img src=".imgs/5CE-Review-Screenshot%202026-01-02%20231907.png" width="300" alt="作成：確認して送信" />
      <br />
      作成：確認して送信
    </td>
    <td align="center">
      <img src=".imgs/6S-ThemeStudio-Screenshot%202026-01-02%20232221.png" width="300" alt="テーマスタジオ：UIカスタム" />
      <br />
      テーマスタジオ：UIカスタム
    </td>
  </tr>
</table>

## ダウンロード
- GitHub Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases
- Windowsのポータブル`.exe`は単体で動作します（実行にNode.jsは不要）。
- アプリのデータは標準のElectronユーザーデータディレクトリに保存されます（設定 > アプリ情報 に表示）。`VRC_EVENT_DATA_DIR`で上書きできます。

## 特長
- グループごとにイベント詳細を自動入力するプロフィール/テンプレート。
- 繰り返しパターン生成（次回候補リスト + 手動の日時入力）。
- グループカレンダー向けのイベント作成ウィザード。
- 今後のイベント用の「イベント編集」ビュー（グリッド + 編集モーダル）。
- プリセット付きテーマスタジオとUIカラーの完全制御（#RRGGBBAA対応）。
- 画像ID用のギャラリー選択・アップロード。
- 初回起動時の言語選択付きローカライズ（en, fr, es, de, ja, zh, pt, ko, ru）。

## データ保存
アプリのファイルはElectronのユーザーデータディレクトリに保存されます（設定 > アプリ情報 に表示）：

- `profiles.json`（プロファイルテンプレート）
- `cache.json`（セッショントークン）
- `settings.json`（連絡先メール）
- `themes.json`（テーマプリセットとカスタムカラー）

`VRC_EVENT_DATA_DIR`の環境変数で保存先ディレクトリを変更できます。
初回起動時、アプリはプロジェクトフォルダ内の既存`profiles.json`のインポートを試みます。

キャッシュファイルは共有しないでください。セッショントークンが含まれています。

## 使用上の注意
- プロフィールにはプロフィール名、イベント名、説明が必要です。
- VRChat API の利用には初回起動時に連絡先メールが必要です。
- 非公開グループはアクセス種別を「グループ」のみにできます。
- 時間は DD:HH:MM 形式で、最大 31 日です。
- タグは最大 5、言語は最大 3 です。
- ギャラリーのアップロードは PNG/JPG、64-2048 px、10MB 未満、1アカウント64枚まで。
- VRChat は同時に最大 10 件の今後のイベントまで対応しています。

## アップデート
- 起動時と実行中は1時間ごとにチェックします。
- 新しいバージョンがあると UPDATE が GitHub リポジトリにリンクします。
- UPDATE 表示中はイベントの作成・編集がブロックされます。
- 自動更新はありません。更新は手動です。

## トラブルシューティング
- ログインできない場合：`cache.json`を削除して再ログインしてください（データフォルダはアプリ情報に表示）。
- グループが見つからない場合：対象グループでカレンダー権限が必要です。
- レート制限：VRChatがイベント作成を制限する場合があります。待って再試行し、失敗が続く場合は停止してください。更新やイベント作成ボタンを連打しないでください。

## プライバシーとセキュリティ
- パスワードは保存されません。セッショントークンのみキャッシュされます。
- `cache.json`やアプリのデータフォルダを共有しないでください。

## 翻訳
*翻訳は機械翻訳のため不正確な場合があります。修正にご協力ください。
- English: ../README.md
- Français: README.fr.md
- Español: README.es.md
- Deutsch: README.de.md
- 日本語: README.ja.md
- 中文（简体）: README.zh.md
- Português: README.pt.md
- 한국어: README.ko.md
- Русский: README.ru.md

## 仕組み
- アプリはElectronを使用しています:
  - `electron/main.js` がVRChat API呼び出し、プロファイル永続化、セッションキャッシュを担当。
  - `electron/preload.js` がレンダラーにIPCメソッドを公開。
  - `electron/renderer/` がUIを描画し、ウィザードの流れを管理。
  - `electron/core/date-utils.js` がパターンから今後の日付を生成。

## 免責事項
このプロジェクトはVRChatとは無関係であり、VRChatによる承認もありません。自己責任でご利用ください。

## 要件（ソースからビルド）
- Node.js 20+（22.21.1推奨）
- npm
- 少なくとも1つのグループでイベントを作成できるVRChatアカウント

## セットアップ（ソースから）
1) 依存関係をインストール:

```bash
npm install
```

2) VRChat APIの利用のため連絡先メールを設定:
- 初回起動時に入力、またはアプリ情報で更新できます。

## 起動（ソースから）
```bash
npm run start:gui
```

## ビルド
- Windowsポータブルビルド:

```bash
npm run dist:gui
```

- クロスプラットフォームビルド（DMG/AppImage用にmacOS/Linuxのツールが必要）:

```bash
npm run dist:gui:all
```
