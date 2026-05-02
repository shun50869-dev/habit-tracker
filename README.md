# Habits — 静かな記録

個人用ハビットトラッカーのPWA。バニラJSのみ。フレームワーク無し。

## できること

- 3種類の記録方式を1アプリで混在
  - **○×** — 朝の瞑想やったか・読書したか
  - **回数** — 腕立て30回 / 水を8杯 など目標値付き
  - **時間(分)** — 瞑想10分・運動30分など
- ストリーク(連続日数)・最長記録・30日達成率
- 月間カレンダーヒートマップ(過去日も編集可)
- 過去30日の棒グラフ
- 各日の総合メモ(日記欄)
- リマインダー(制約あり、後述)
- データのエクスポート/インポート(JSON)
- ライト/ダーク/システム連動
- オフライン動作(Service Worker)
- ホーム画面に追加してネイティブアプリ風に

## ファイル構成

```
habit-tracker/
├── index.html          # 構造
├── styles.css          # スタイル(refined minimalism)
├── app.js              # 全ロジック(localStorage)
├── manifest.json       # PWAマニフェスト
├── sw.js               # Service Worker
├── icon-192.png        # アイコン
├── icon-512.png
├── icon-512-maskable.png
├── favicon.png
└── README.md
```

## 動かす — 3つの方法

### 1. ローカルで触ってみる(最速)

PWA機能(オフライン・ホーム追加)を使うにはHTTPSかlocalhostが必要。

```bash
cd habit-tracker
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080` を開く。

### 2. スマホで触る(本命)

PCとスマホを同じWi-Fiにつなぎ、PCのIPで開く:

```bash
# PCのIPを確認(macOS)
ipconfig getifaddr en0
# Linux
hostname -I | awk '{print $1}'

python3 -m http.server 8080
```

スマホのChromeで `http://<PCのIP>:8080` を開く。
**※ HTTPだとPWAインストール不可。試すだけならこれでOK、本格運用は次の3を推奨。**

### 3. GitHub Pagesで本番デプロイ(完全無料・推奨)

```bash
cd habit-tracker
git init
git add .
git commit -m "init habit tracker"
gh repo create habit-tracker --public --source=. --push
# または GitHub上で手動でリポジトリ作成して push
```

GitHubのリポジトリ → Settings → Pages → Source: `main` branch → `/ (root)` → Save。
1〜2分待つと `https://<username>.github.io/habit-tracker/` で公開される。

スマホのChromeでそのURLを開いて → メニュー → **「ホーム画面に追加」** で完了。

代替: Netlify(ドラッグ&ドロップ) / Vercel / Cloudflare Pages — いずれも無料枠で十分。

## 通知の現実(正直な制約)

PWAの定期通知は OS/ブラウザの制約が強い:

| 状況 | 動く? |
|---|---|
| アプリを開いている間のリマインダー | ○ |
| アプリを閉じた状態での確実な毎日通知 | △〜× (ブラウザ次第・バックグラウンド制限あり) |
| Web Push API (FCM経由) | ○ だがバックエンド必要 |

**現実解:**
- 厳密な毎日通知が要るなら、Googleカレンダーに繰り返し予定で代替
- もしくは Firebase Cloud Messaging を後付け(無料枠あり、別途バックエンド必要)
- 個人用途で「アプリ開いた時に思い出す」運用なら現状の実装で十分

## Claude Codeで継続開発する

このプロジェクトはClaude Codeで触りやすいよう、シンプルなバニラJS構成にしてある。

```bash
# Claude Codeをインストール(まだなら)
npm install -g @anthropic-ai/claude-code

cd habit-tracker
claude
```

### 改造のとっかかり例(Claude Codeに投げる用)

- 「週次ビューを追加して、今週の達成率をリングチャートで表示して」
- 「習慣に並び順をドラッグで変えられるようにして」
- 「タグ機能を追加して、健康/学習/仕事 でフィルタできるようにして」
- 「データをFirebaseに同期して複数端末で使えるようにして」(認証実装が要る)
- 「達成時に紙吹雪のアニメを入れて」
- 「pomodoroタイマーを内蔵して、time型の習慣で使えるようにして」

### データ構造(localStorage キー: `habits.v1`)

```js
{
  habits: [
    {
      id: "h_xxx",
      name: "朝の瞑想",
      type: "check" | "count" | "time",
      target: 30,         // count/timeで使用
      unit: "回",          // count用、timeは強制で"分"
      reminderTime: "07:00" | null,
      color: "#8b4513",
      createdAt: 1234567890
    }
  ],
  records: {
    "h_xxx": {
      "2026-05-01": { value: 1, memo: "...", ts: ... }
    }
  },
  diary: {
    "2026-05-01": "今日の手触り"
  },
  settings: { theme: "auto" | "light" | "dark" }
}
```

## 既知の制限

- 単一端末・localStorage前提。バックアップは設定画面のエクスポート機能で
- 通知の定期実行は環境依存(上記参照)
- 過去日の編集はカレンダーをタップで可能、ただし未来日はロック

## License

個人利用前提。好きにいじって良い。
