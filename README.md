# My Remote PC

自分が所有・管理するWindows PCを、iPad/PCのブラウザから操作するWebRTCリモートデスクトップです。Renderは認証と接続仲介だけを行い、画面は可能な限り端末間で直接通信します。

## セキュリティ

- RenderのHTTPS/WSS、HttpOnlyセッションCookie、8時間で失効するJWT
- ログイン試行制限（15分に8回）、32文字以上のエージェント秘密鍵
- 画面データと操作データはWebRTCのDTLS/SRTPで暗号化
- 秘密値はGitに保存しない

これは自分のPCだけで使用してください。接続中はPC側のコンソールを閉じないでください。

## Renderへ公開

1. GitHubへこのフォルダをpushします。
2. Render Dashboardで **New > Blueprint** を開き、リポジトリを選択します。
3. `APP_PASSWORD` に12文字以上（推奨20文字以上）の固有パスワードを設定します。
4. `AGENT_SECRET` に32文字以上の別のランダム文字列を設定し、安全に控えます。

## Windowsエージェント

Python 3.11/3.12をインストールし、PowerShellで以下を実行します。

```powershell
cd agent
.\install.ps1
```

`agent/config.json` の `server` をRender URL（`wss://...onrender.com`）、`secret` をRenderの `AGENT_SECRET` に変更し、起動します。

```powershell
.\start.ps1
```

iPadのSafariでRender URLを開き、ログイン後「接続」を押します。

### PC側を1クリックで起動

`agent`フォルダで次を実行すると、デスクトップに `My Remote PC` ショートカットを作成します。

```powershell
.\setup-shortcut.ps1
```

Windowsログイン時に自動起動する場合：

```powershell
.\enable-autostart.ps1
```

自動起動を解除する場合：

```powershell
.\disable-autostart.ps1
```

## 制限

- WindowsのUACなど「セキュアデスクトップ」は操作できません。
- 無料Renderサービスは休止後の初回起動に時間がかかります。
- 厳しいNAT環境ではP2P接続できません。本番運用ではTURNサービスを追加してください。
- 現在は単一PC・単一同時接続向けです。音声とクリップボード転送は未実装です。
