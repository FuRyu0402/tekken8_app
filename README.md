# 鉄拳8 戦績カウンター

鉄拳8のWIN／LOSE戦績を管理するWindows向けElectronアプリです。
同じ親フォルダに配置した [`tekken8_auto_tracker`](https://github.com/FuRyu0402/tekken8_auto_tracker) と連携し、画面からの自動判定と手動補正に対応します。

## 主な機能

- 総試合数、WIN、LOSE、勝率の表示
- 直近10件の履歴表示
- WIN／LOSEの手動追加
- 直前の有効な記録を1件取り消し
- 全記録の消去と事前バックアップ
- キャプチャ対象モニターの一覧取得と選択
- 自動判定の開始・停止
- 自動判定中のリアルタイム統計更新
- Electron終了時のPythonプロセス自動停止

## 必要環境

- Windows
- Node.js／npm
- Python仮想環境と学習済みモデルを含む `tekken8_auto_tracker`
- `tekken8_app` と `tekken8_auto_tracker` を同じ親フォルダに置く構成

## 想定ディレクトリ構成

```text
C:\Users\ユーザー名\Desktop
├─ tekken8_app
└─ tekken8_auto_tracker
```

## セットアップ

1. `tekken8_app` で依存パッケージをインストールします。

   ```powershell
   npm install
   ```

2. `tekken8_auto_tracker` 側にPython仮想環境、必要なライブラリ、学習済みモデルを用意します。

3. アプリを起動します。

   ```powershell
   npm start
   ```

## 基本的な使い方

1. アプリに表示された一覧から、鉄拳8を表示しているモニターを選択します。
2. 「自動判定を開始」を押します。
3. 鉄拳8で対戦します。
4. 試合終了時は、判定できるようにWIN／LOSE画面を数秒残します。
5. 利用を終えるときは「自動判定を停止」を押します。

現在の実機環境では、`mss` のモニター2が鉄拳8の画面でした。ただし、`mss` の番号はWindowsのディスプレイ番号と一致するとは限りません。解像度と座標も確認して選択してください。

## 手動操作

- 「WIN追加」「LOSE追加」で結果を手動追加できます。
- 「直前の1件を取り消す」で最後の有効なWIN／LOSE記録を取り消せます。
- 「全記録を消去する」で確認後に全記録を消去できます。
- 自動判定中は、誤操作防止のため取消と全消去が無効になります。WIN／LOSEの手動追加は利用できます。

## データ保存

- 実データは `tekken8_auto_tracker/logs/match_results.csv` に保存されます。
- 全消去時は、消去前のCSVが `tekken8_auto_tracker/archive` にバックアップされます。
- Python側ではプロセス間CSVロックを使用しています。
- 取消と全消去では、一時ファイルへの完全書き込み後に原子的置換を行います。
- `tekken8_app` 側の `localStorage` は使用しません。

## 開発用コマンド

```powershell
# アプリ起動
npm start

# Nodeテスト
npm test

# Windows向けパッケージ作成
npm run package
```

## 現在の制約

- キャプチャ対象はモニター選択方式です。
- 鉄拳8のゲームウィンドウを直接指定する機能は未実装です。
- 勝敗画面を短時間で飛ばすと、結果を取りこぼす可能性があります。
- 2つのリポジトリが同じ親フォルダにあることを前提としています。
- Windows向けです。

## 安全上の注意

- 全消去時にはバックアップを作成しますが、重要なデータは別の場所にも保管してください。
- 実データを使わずに検証する場合は、Electron起動前に一時パスを指定できます。

  ```powershell
  $env:TEKKEN8_LOG_PATH = '一時ディレクトリ\logs\match_results.csv'
  $env:TEKKEN8_ARCHIVE_DIR = '一時ディレクトリ\archive'
  ```

- デバッグ画像を保存せずに自動判定を確認する場合は、次を指定します。

  ```powershell
  $env:TEKKEN8_DISABLE_DEBUG_IMAGES = '1'
  ```

## 関連リポジトリ

- [FuRyu0402/tekken8_auto_tracker](https://github.com/FuRyu0402/tekken8_auto_tracker)
