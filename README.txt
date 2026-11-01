18夜の月（cafe＆bar Moonlight ケーキアルバム）2026/11/1〜11/18

■ これは何
  お客さん用ページ（index.html）と、従業員用の受付ページ（staff.html）です。
  iPhone版の従業員管理とは別のページで、GitHub の moonlight-18nights リポジトリに置きます。
    お客さん用：https://57momotarou.github.io/moonlight-18nights/
    受付（従業員）：https://57momotarou.github.io/moonlight-18nights/staff.html   ← 合言葉が必要
  テスト：URLの最後に ?test=1（本番とは別の記録）

■ はじめて置くとき
  1. このフォルダー（moonlight-18nights）の中身をすべてリポジトリにアップロード
  2. config.js に Supabase の URL と Publishable key を書き込む（Secret key は入れない）
  3. Settings → Pages で main ブランチを公開

■ 更新のしかた
  更新用ZIP（Moonlight_18nights_update.zip）の中身をリポジトリへ上書きします。
  config.js は更新用ZIPに入っていないので、書き込んだ接続先は消えません。

■ ケーキの画像
  画像はこのリポジトリに置きません（メニューがばれないように）。
  Windows版の「18夜の月 → 設定 → ケーキ画像を登録」で Supabase に送ります。

■ データ
  Supabase の cake_* テーブル（SQL は yuzucity/docs/supabase/moonlight_cake_album.sql）。
  管理（寄せ書き・記録・名前変更の承認など）は Windows版の「18夜の月」で行います。
