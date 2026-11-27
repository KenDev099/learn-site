# 咖啡店 API 維運手冊（runbook）

練習 5：照課程頁的要求補完這份文件。每一段都要有可以直接複製執行的指令（放在 ```sh 程式碼區塊裡），
指令裡提到的腳本與設定檔都要真的存在於這個資料夾。下面的「部署」是範例。

所有指令都在這個資料夾執行。環境：sh up.sh；網址：https://localhost:18263（憑證用 certs/ca.crt 驗證）。

## 部署

什麼時候用：要上新版本。部署前確認 CI 是綠的、migration 是向後相容的（第 17 課）。

```sh
image=$(sh release.sh 2.1.0)   # 正式環境由 CI 建置、推到 registry，這裡填 registry@sha256:…
sh deploy.sh "$image"
curl --cacert certs/ca.crt https://localhost:18263/version
```

成功的樣子：deploy.sh 印出「已切到 …」，/version 是新版本。deploy.sh 失敗時流量不會切換，看它印出的原因。
