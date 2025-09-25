# Vocal Persona Editor

AIを使って詳細なキャラクターペルソナを作成・管理・テストできるWebアプリケーションです。React + TypeScriptで構築され、サーバー側で安全にAI／TTS APIをプロキシして利用できる設計になっています。ポートフォリオやゲーム開発、キャラクターデザイン、シナリオ作成のワークフローに向いています。

主なポイント
- 「何ができるか（機能）」
- 「どう使うか（インストール・起動・基本操作）」
- 簡単な技術スタックとファイル構成

#　✨ 機能
- ペルソナ管理
  - 作成・編集：名前、役割、性格、背景、世界観などのパラメータを編集可能
  - ペルソナ一覧：カード表示で作成済みペルソナを一覧管理
  - 削除・エクスポート：不要なペルソナの削除、JSONでのエクスポート／インポート可能
- AIによる自動生成・補助
  - トピックから生成：短いプロンプト（例：「陽気な宇宙海賊の船長」）からAIがペルソナを自動生成
  - ファイルから生成：.txt または .json でアップロードしたキャラクターシートを解析してペルソナ化
  - AIサマリー：定義済みパラメータから物語性のある要約を生成・編集し、パラメータへ反映
  - MBTI解析（自動分析）：AIによる性格分類やレーダーチャート表示（UIでの可視化）
- 対話とテスト
  - テストチャット：エディタ内で短い会話で口調や性格をすばやく確認
  - プロダクションチャット：フル画面のチャット UI で実際の対話を行う
  - テキスト読み上げ（TTS）：Fish Audio API を使った音声合成でキャラの声を再生
  - 音声入力（STT）：ブラウザの Web Speech API を使ったマイク入力で会話（ローカルでの体験）
- バージョン管理
  - 保存ごとにバージョンが作成され、変更点をAIが要約
  - 過去のバージョンの復元が可能

#　技術スタック
- フロントエンド: React, TypeScript, Vite, Tailwind CSS（CDN）、React Icons
- バックエンド: Vercel Serverless Functions（本番） / Express.js + tsx（開発）
- AIモデル: Google Gemini API（サーバープロキシ経由で利用）
- データ永続化: Vercel Blob
- TTS: Fish Audio API（プロキシ経由）
- STT: Web Speech API（ブラウザ）
- 開発補助: concurrently, dotenv

#　セキュリティ上の注意
- AI APIキーやTTSトークン等の機密値はサーバー側でのみ使用し、クライアントへは公開しないでください。
- .env に置く値は公開リポジトリへコミットしないでください。

#　セットアップ（ローカル開発）
1. リポジトリをクローン
   git clone https://github.com/LOU-Ark/vocal-persona-editor.git
   cd vocal-persona-editor

2. 環境変数
   プロジェクトルートに .env ファイルを作成し、以下を設定してください。

   - Google Gemini API（必須）
     API_KEY=YOUR_GOOGLE_API_KEY
     ※サーバー側（api/gemini.ts 等）で利用します

   - Fish Audio TTS（任意、TTS機能を使う場合）
     FISH_AUDIO_DEFAULT_TOKEN=YOUR_FISH_AUDIO_TOKEN
     VITE_FISH_AUDIO_DEFAULT_VOICE_ID=default_voice_id
     VITE_FISH_AUDIO_DEFAULT_NAME="デフォルト音声名"

   その他、必要に応じて環境変数を追加してください。

3. 依存関係のインストール
   npm install

4. 開発サーバーの起動
   npm run dev

   - フロントエンド: http://localhost:5173
   - バックエンドAPI（ローカル開発用 Express）: http://localhost:3001

   （npm run dev は concurrently 等でフロントエンドとローカルAPIを同時起動するスクリプトです）

#　使い方（基本フロー）
1. ペルソナ作成
   - 「Create Persona」等のUIから手動でパラメータを入力するか、
   - 「Generate from prompt」で簡単な説明を入力してAIに自動生成させるか、
   - ペルソナシート（.txt/.json）をアップロードして解析させる

2. ペルソナ編集と保存
   - パラメータ修正後に保存するとバージョンが作成されます
   - 必要に応じて過去バージョンへ戻すことができます

3. テストチャット／プロダクションチャット
   - エディタ内のテストチャットで短い会話を試し、口調や一貫性を確認
   - プロダクションチャットで長い対話を行い、音声合成（TTS）や音声入力（STT）を併用可能

4. エクスポート
   - ペルソナは JSON でエクスポートでき、別インスタンスへインポートできます

#　API（サーバーサイド）
- api/config.ts: フロントエンドへ公開する設定を返す（必要に応じて）
- api/gemini.ts: Google Gemini API の安全なサーバープロキシ（クライアントは直接キーに触れない）
- api/tts.ts: Fish Audio TTS のサーバープロキシ
- server.ts: ローカル開発用の Express サーバー（必要に応じて参照）

#　デプロイ
- 推奨: Vercel
  - リポジトリを Vercel にインポートすれば自動ビルド・デプロイが可能です
  - Vercel の環境変数設定に API_KEY や FISH_AUDIO_* を登録してください
- ビルドコマンド: npm run build（Vercel が自動実行）

#　ファイル構成（要約）
.
├── api/                     # サーバーサイドのサーバレス関数 / 開発用API
│   ├── config.ts
│   ├── gemini.ts
│   ├── server.ts
│   └── tts.ts
├── components/              # UI コンポーネント群（エディタ、リスト、チャット等）
│   ├── PersonaEditorModal.tsx
│   ├── PersonaList.tsx
│   ├── ProductionChat.tsx
│   └── ...
├── services/
│   └── geminiService.ts     # フロントエンドから API を呼ぶクライアントラッパー
├── App.tsx                  # メインのアプリケーション
├── package.json
└── README.md

# 貢献
- バグ報告や機能提案は Issue を立ててください。
- プルリクエスト歓迎。大きな変更は事前に Issue で相談してください。

# ライセンス
- リポジトリにライセンスファイルが無い場合は、使用目的に応じて追加してください（例: MIT）。

# 補足（運用上の注意）
- APIキーは必ずサーバー側で保管・使用すること（クライアントに露出させない）。
- Google Gemini API の呼び出し制限や課金に注意すること。
- TTS の利用規約や音声素材の扱いにも注意してください。