# Copilot API Proxy

**[English](README.md) | 涓枃**

> [!NOTE]
> **鍏充簬鏈垎鏀?*
> 鏈」鐩?fork 鑷?[ericc-ch/copilot-api](https://github.com/ericc-ch/copilot-api)銆傜敱浜庡師浣滆€呭凡鍋滄缁存姢涓斾笉鍐嶆敮鎸佹柊 API锛屾垜浠鍏惰繘琛屼簡閲嶆柊璁捐鍜岄噸鍐欍€?> 鐗瑰埆鎰熻阿 [@ericc-ch](https://github.com/ericc-ch) 鐨勫師鍒涘伐浣滃拰璐＄尞锛?
> [!WARNING]
> 杩欐槸涓€涓?GitHub Copilot API 鐨勯€嗗悜浠ｇ悊銆傚畠涓嶅彈 GitHub 瀹樻柟鏀寔锛屽彲鑳戒細鎰忓澶辨晥銆備娇鐢ㄩ闄╄嚜璐熴€?
> [!WARNING]
> **GitHub 瀹夊叏鎻愮ず锛?*  
> 杩囧害鐨勮嚜鍔ㄥ寲鎴栬剼鏈寲浣跨敤 Copilot锛堝寘鎷€氳繃鑷姩鍖栧伐鍏疯繘琛岀殑蹇€熸垨鎵归噺璇锋眰锛夊彲鑳戒細瑙﹀彂 GitHub 鐨勬互鐢ㄦ娴嬬郴缁熴€? 
> 鎮ㄥ彲鑳戒細鏀跺埌 GitHub 瀹夊叏鍥㈤槦鐨勮鍛婏紝杩涗竴姝ョ殑寮傚父娲诲姩鍙兘瀵艰嚧鎮ㄧ殑 Copilot 璁块棶鏉冮檺琚殏鏃跺仠鐢ㄣ€?>
> GitHub 绂佹浣跨敤鍏舵湇鍔″櫒杩涜杩囧害鐨勮嚜鍔ㄥ寲鎵归噺娲诲姩鎴栦换浣曠粰鍏跺熀纭€璁炬柦甯︽潵涓嶅綋璐熸媴鐨勬椿鍔ㄣ€?>
> 璇锋煡闃咃細
>
> - [GitHub 鍙帴鍙椾娇鐢ㄦ斂绛朷(https://docs.github.com/site-policy/acceptable-use-policies/github-acceptable-use-policies#4-spam-and-inauthentic-activity-on-github)
> - [GitHub Copilot 鏉℃](https://docs.github.com/site-policy/github-terms/github-terms-for-additional-products-and-features#github-copilot)
>
> 璇疯礋璐ｄ换鍦颁娇鐢ㄦ浠ｇ悊锛屼互閬垮厤璐︽埛鍙楅檺銆?
---

**娉ㄦ剰锛?* 濡傛灉鎮ㄦ鍦ㄤ娇鐢?[opencode](https://github.com/sst/opencode)锛屽垯涓嶉渶瑕佹椤圭洰銆侽pencode 宸插唴缃敮鎸?GitHub Copilot 鎻愪緵鍟嗐€?
---

## 椤圭洰姒傝堪

涓€涓?GitHub Copilot API 鐨勯€嗗悜浠ｇ悊锛屽皢鍏舵毚闇蹭负 OpenAI銆丄nthropic 涓?Gemini锛堝吋瀹癸級鏈嶅姟銆傜綉鍏充細鍩轰簬妯″瀷 `supported_endpoints` 鍋氳兘鍔涢┍鍔ㄥ垎娴侊紝骞跺湪蹇呰鏃跺仛鍗忚杞崲锛屽洜姝ゅ彲涓庢敮鎸?OpenAI Chat Completions API銆丱penAI Responses API銆丄nthropic Messages API 鎴?Gemini generateContent 鎺ュ彛鐨勫鎴风閰嶅悎浣跨敤锛堝寘鎷?[Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)锛夈€?
## 鏋舵瀯

鏈」鐩綋鍓嶆槸鈥?*鑳藉姏椹卞姩鍒嗘祦缃戝叧**鈥濓紝涓嶆槸鍗曚竴璺緞閫忎紶浠ｇ悊锛?
1. 瀵瑰鍚屾椂鎻愪緵 OpenAI / Anthropic / Gemini锛堝吋瀹癸級鍏ュ彛銆?2. 瀵瑰唴鏍规嵁妯″瀷 `supported_endpoints` 鍔ㄦ€侀€夋嫨涓婃父绔偣銆?3. 鍏ュ彛鍗忚涓庢渶缁堜笂娓稿崗璁彲鑳戒笉鍚岋紙浼氬仛鍙屽悜鏍煎紡杞崲锛夈€?
```mermaid
flowchart TB
    subgraph Clients["瀹㈡埛绔?]
        C1[OpenAI 鍏煎瀹㈡埛绔痌
        C2[Anthropic 鍏煎瀹㈡埛绔痌
        C3[Gemini 鍏煎瀹㈡埛绔痌
    end

    subgraph Proxy["copilot-api"]
        direction TB

        subgraph Ingress["鍏ュ彛"]
          I1["/v1/chat/completions"]
          I2["/v1/messages"]
          I3["/v1/responses"]
          I4["/v1beta/models/{model}:generateContent<br/>:streamGenerateContent"]
        end

        subgraph Router["鑳藉姏椹卞姩璺敱"]
            R1[鎸?supported_endpoints 鍒ゆ柇]
        end

        subgraph Upstream["涓婃父 Copilot 绔偣"]
          U1["/chat/completions"]
          U2["/v1/messages"]
          U3["/responses"]
        end

        subgraph Admin["绠＄悊涓庣姸鎬?]
          A1["/admin"]
          A2["/usage"]
          A3["/token"]
            A4[config.json + state]
        end
    end

    C1 --> I1
    C2 --> I2
    C3 --> I4

    I1 --> R1
    I2 --> R1
    I3 --> R1
    I4 --> R1

    R1 --> U1
    R1 --> U2
    R1 --> U3
```

## 璇锋眰娴佺▼锛堝綋鍓嶇増鏈級

### /v1/messages锛圓nthropic 鍏ュ彛锛?- 鏀寔 messages -> 璧?`/v1/messages`
- 鍚﹀垯鏀寔 responses -> 杞崲鍚庤蛋 `/responses`
- 鍚﹀垯 -> 杞崲鍚庤蛋 `/chat/completions`

### /v1/chat/completions锛圤penAI Chat 鍏ュ彛锛?- 鏀寔 chat -> 璧?`/chat/completions`
- 鍚﹀垯鏀寔 messages -> 鍥為€€鍒?`/v1/messages`
- 鍚﹀垯鏀寔 responses -> 鍥為€€鍒?`/responses`
- 鑻ユā鍨嬪０鏄庝簡 `supported_endpoints` 涓斾笁鑰呴兘涓嶆敮鎸?-> 杩斿洖 400
- 鑻ユā鍨嬫湭鎻愪緵 endpoints 鍏冩暟鎹紙绌?缂哄け锛?> 榛樿鎸?chat 璺緞灏濊瘯

### /v1/responses锛圤penAI Responses 鍏ュ彛锛?- 浠呭湪妯″瀷鏀寔 responses 鏃舵斁琛?- 涓嶆敮鎸佺洿鎺ヨ繑鍥?400锛堜笉鍋氬璺洖閫€锛?
### /v1beta/models/{model}:generateContent / streamGenerateContent锛圙emini 鍏煎鍏ュ彛锛?- 褰撳墠閲囩敤 chat-only 璁捐锛欸emini 璇锋眰缁熶竴杞崲鍒?`/chat/completions`
- 鎵ц椤哄簭涓衡€滃厛鏍￠獙妯″瀷鑳藉姏锛屽啀鍋?Gemini -> Chat 杞崲鈥?- 鑻ユā鍨嬩笉鏀寔 chat锛岀洿鎺ヨ繑鍥?400锛堜笉璧?messages/responses 鍥為€€锛?- 褰撳墠浠呭鐞?`contents.parts.text` 鏂囨湰杈撳叆

## 鍔熻兘鐗规€?
- **澶氬崗璁叆鍙?*锛歄penAI Chat銆丱penAI Responses銆丄nthropic Messages銆丟emini锛堝吋瀹癸級鍏ュ彛銆?- **鑳藉姏椹卞姩鍒嗘祦**锛氬熀浜庢ā鍨?`supported_endpoints` 鍔ㄦ€佽矾鐢憋紝涓嶇‖缂栫爜妯″瀷鍚嶃€?- **鍙屽悜杞崲灞?*锛氭敮鎸?Anthropic <-> Chat銆丄nthropic <-> Responses銆丆hat <-> Gemini锛堝吋瀹癸級杞崲銆?- **Web 璐︽埛绠＄悊**锛氶€氳繃 `/admin` 娣诲姞鍜岀鐞嗗涓?GitHub 璐︽埛銆?- **澶氳处鎴锋敮鎸?*锛氭棤闇€閲嶅惎鍗冲彲鍒囨崲璐︽埛銆?- **Docker 浼樺厛閮ㄧ讲**锛氬鍣ㄥ寲閮ㄧ讲锛岄厤缃寔涔呭寲銆?- **浣跨敤閲忕洃鎺?*锛氶€氳繃 `/usage` 鏌ョ湅浣跨敤涓庨厤棰濄€?- **閫熺巼闄愬埗鎺у埗**锛氭敮鎸侀檺娴佷笌绛夊緟绛栫暐銆?- **璐︽埛绫诲瀷鏀寔**锛氫釜浜?/ 鍟嗕笟 / 浼佷笟璐︽埛銆?- **閾捐矾杩借釜鑳藉姏**锛氭瘡涓姹傞兘鏀寔 `x-trace-id`锛堟帴鏀舵垨鑷姩鐢熸垚锛夛紝骞跺皢鍚屼竴 ID 閫忎紶涓轰笂娓?`x-request-id` / `x-agent-task-id`锛屼究浜庣鍒扮鎺掗殰銆?
## Docker 蹇€熷紑濮?
### 浣跨敤 Docker Compose锛堟帹鑽愶級

```bash
# 鍚姩鏈嶅姟鍣?docker compose up -d

# 鏌ョ湅鏃ュ織
docker compose logs -f
```

鐒跺悗璁块棶 **http://localhost:4141/admin** 娣诲姞鎮ㄧ殑 GitHub 璐︽埛銆?
### 浣跨敤 Docker Run

```bash
docker run -d \
  --name copilot-api \
  -p 4141:4141 \
  -v copilot-data:/data \
  --restart unless-stopped \
  ghcr.io/qlhazycoder/copilot-api:latest
```

## 璐︽埛璁剧疆

1. 浣跨敤 Docker 鍚姩鏈嶅姟鍣?2. 鍦ㄦ祻瑙堝櫒涓墦寮€ [http://localhost:4141/admin](http://localhost:4141/admin)锛堝繀椤讳粠 localhost 璁块棶锛?3. 鐐瑰嚮"娣诲姞璐︽埛"寮€濮?GitHub OAuth 璁惧娴佺▼
4. 鍦?GitHub 璁惧鎺堟潈椤甸潰杈撳叆鏄剧ず鐨勪唬鐮?5. 鎺堟潈瀹屾垚鍚庯紝鎮ㄧ殑璐︽埛灏嗚嚜鍔ㄩ厤缃?
绠＄悊闈㈡澘瑕嗙洊 `Accounts`銆乣Models`銆乣Usage`銆乣Model Mappings`銆乣Settings` 浜斾釜鏍囩椤点€?
## Admin 椤甸潰鑳藉姏

### Accounts锛堣处鎴凤級
- 鏀寔娣诲姞/鍒囨崲/鍒犻櫎/鎷栨嫿鎺掑簭澶氫釜 GitHub 璐︽埛銆?- 璐︽埛椤典細鎸夎疆璇㈠懆鏈熻嚜鍔ㄥ埛鏂拌处鎴风姸鎬佷笌鐢ㄩ噺锛堣繎瀹炴椂锛屼笉鏄?WebSocket 鎺ㄩ€侊級銆?- 姣忎釜璐︽埛鐨勭敤閲忓熀浜庤璐︽埛 token 鐙珛鎷夊彇銆?
![璐﹀彿椤甸潰](docs/images/璐﹀彿椤甸潰.png)

### Models锛堟ā鍨嬶級
- 鎸?provider 鍒嗙粍灞曠ず妯″瀷銆?- 鏀寔鈥濆彲瑙?/ 闅愯棌鈥濈瓫閫変笌绠＄悊妯″紡涓嬬殑鍙鎬у垏鎹€?- 鏀寔鍙屽嚮鍊嶇巼杩涜鍐呰仈缂栬緫锛坧remium multiplier锛夛紝鐢ㄤ簬鏈湴鐢ㄩ噺鏃ュ織缁熻銆?- 鏀寔鎸夋ā鍨嬮厤缃帹鐞嗗己搴︼紙绠＄悊椤碉級锛氫粎褰撴ā鍨嬪０鏄庢敮鎸佺殑鎺ㄧ悊绛夌骇鏃舵墠鏄剧ず閫夐」锛涘鎴风鏈樉寮忎紶鎺ㄧ悊瀛楁鏃讹紝浠ｇ悊涓嶄細鑷姩琛ュ弬銆?- 妯″瀷鍗＄墖鍙樉绀哄姛鑳界壒鎬т笌涓婁笅鏂囩獥鍙ｇ瓑淇℃伅銆?
![妯″瀷鍙鍒楄〃](docs/images/妯″瀷鍙.png)
![妯″瀷闅愯棌鍒楄〃](docs/images/妯″瀷闅愯棌.png)
![妯″瀷鍙绠＄悊](docs/images/妯″瀷鍙绠＄悊.png)
![妯″瀷闅愯棌绠＄悊](docs/images/妯″瀷闅愯棌绠＄悊.png)


### Usage锛堢敤閲忥級
- 鎻愪緵鐢ㄩ噺姒傝涓庤姹傛棩蹇楀垪琛ㄣ€?- 鏃ュ織鎸夊綋鍓嶆椿璺冭处鎴烽殧绂诲瓨鍌紝涓嶅悓璐﹀彿鏁版嵁涓嶆贩鍚堛€?- 鏀寔鏈湴 usage log 缁熻妯″紡鍒囨崲锛?  - `request`锛氭瘡娆¤姹傞兘璁板綍涓€娆?  - `conversation`锛氬彧鏈夊湪鍚屼竴瀵硅瘽涓?`endpoint`銆乣model`銆乣multiplier` 閮界浉鍚屾椂鎵嶆姌鍙犱负鍚屼竴鏉★紱鍙杩欎簺鍏抽敭瀛楁涔嬩竴鍙樺寲锛屽氨浼氭柊澧炰竴鏉℃湰鍦版棩蹇楀苟閲嶆柊瑙﹀彂涓€娆℃湰鍦?usage 鎽樿鍒锋柊
- 鏂板鏈湴 `棰濆害澧為噺` 鍒楋細
  - `max(lastPremiumUsed - firstPremiumUsed, 0) + multiplier`
  - 绗竴鏉¤姹傚厛鎸夊綋鍓嶅€嶇巼璁″叆锛屽悗缁姹傚啀鍙犲姞涓婃父楂樼骇棰濆害绱鍊肩殑澧為噺
- 鏀寔鎸?`source`锛坄all` / `request`锛夌瓫閫変笌娓告爣鍒嗛〉锛沗endpoint` 褰撳墠涓哄睍绀哄瓧娈碉紝灏氶潪鐙珛绛涢€夋潯浠躲€?- 鍙厤缃祴璇?杞闂撮殧锛涢粯璁ら棿闅旀潵鑷厤缃紙榛樿 10 鍒嗛挓锛夛紝娴嬭瘯璇锋眰榛樿妯″瀷涓?`gpt-4o`銆?- 姣忔湀鏃ュ織娓呯悊涓衡€滄寜鍐欏叆鏃舵儼鎬ф竻鐞嗏€濓紙鍐欏叆鏂版棩蹇楁椂娓呯悊闈炲綋鏈堟暟鎹級锛屼笉鏄浐瀹氭椂鍒诲畾鏃朵换鍔°€?- 涓婅堪缁熻妯″紡鍙奖鍝嶆湰鍦?`usage_logs` 灞曠ず涓庢憳瑕佸埛鏂扮瓥鐣ワ紝涓嶆敼鍙?`/usage` 杩斿洖鐨勪笂娓?Copilot 鐪熷疄璁￠噺銆?
![鐢ㄩ噺鏌ョ湅](docs/images/鐢ㄩ噺鏌ョ湅.png)

### Model Mappings锛堟ā鍨嬫槧灏勶級
- 鏀寔鏂板銆佸鍒躲€佸垹闄ゆā鍨嬫槧灏勩€?- 鏀寔鎶婂鎴风妯″瀷鍒悕鏄犲皠鍒?Copilot 瀹為檯妯″瀷銆?- 鐩爣妯″瀷鍙粠 `/v1/models` 鍔ㄦ€佹媺鍙栧悗閫夋嫨銆?
![妯″瀷鏄犲皠](docs/images/妯″瀷鏄犲皠.png)

### Settings锛堣缃級
- 鍙紪杈戝叏灞€闄愭祦涓庣浉鍏抽厤缃」锛堢幆澧冨彉閲忎粛淇濇寔鏇撮珮浼樺厛绾э級銆?- 鍙湪椤甸潰涓厤缃?`anthropicApiKey`锛岀敤浜?Claude `/v1/messages/count_tokens` 鐨勫畼鏂瑰噯纭鏁般€?- 鍖呭惈 Usage 娴嬭瘯闂撮殧绛夌鐞嗛厤缃€?- 鍙竴閿竻鐞嗗綋鍓嶆椿璺冭处鍙峰湪鏈湴淇濆瓨鐨?Usage 鏃ュ織鍒楄〃銆傚巻鍙叉湀浠芥棩蹇椾篃浼氬湪姣忔湀 1 鍙峰悗棣栨鍐欏叆鏂版棩蹇楁椂鑷姩娓呯悊銆?
![缂栬緫璁剧疆](docs/images/缂栬緫璁剧疆.png)

## 鐜鍙橀噺

| 鍙橀噺 | 榛樿鍊?| 鎻忚堪 |
|------|--------|------|
| `PORT` | `4141` | 鏈嶅姟鍣ㄧ鍙?|
| `VERBOSE` | `false` | 鍚敤璇︾粏鏃ュ織锛堜篃鎺ュ彈 `DEBUG=true`锛?|
| `RATE_LIMIT` | - | 璇锋眰涔嬮棿鐨勬渶灏忛棿闅旂鏁?|
| `RATE_LIMIT_WAIT` | `false` | 杈惧埌閫熺巼闄愬埗鏃剁瓑寰呰€屼笉鏄繑鍥為敊璇?|
| `SHOW_TOKEN` | `false` | 鍦ㄦ棩蹇椾腑鏄剧ず浠ょ墝 |
| `PROXY_ENV` | `false` | 浠庣幆澧冨彉閲忎娇鐢?`HTTP_PROXY`/`HTTPS_PROXY` |
| `ADMIN_SECRET` | - | Admin ???????????????????? |
| `ADMIN_SECRET_HASH` | - | Admin ???????????? `ADMIN_SECRET` ??????? |

### 甯﹂€夐」鐨?Docker Compose 绀轰緥

```yaml
services:
  copilot-api:
    image: ghcr.io/qlhazycoder/copilot-api:latest
    container_name: copilot-api
    ports:
      - "4141:4141"
    volumes:
      - copilot-data:/data
    environment:
      - PORT=4141
      - VERBOSE=true
      - RATE_LIMIT=5
      - RATE_LIMIT_WAIT=true
    restart: unless-stopped

volumes:
  copilot-data:
```

濡傛灉娌℃湁閫氳繃鐜鍙橀噺璁剧疆 `RATE_LIMIT` / `RATE_LIMIT_WAIT`锛屼篃鍙互鍦ㄧ鐞嗛〉鐨?`Settings` 鏍囩涓厤缃€傜幆澧冨彉閲忎紭鍏堢骇楂樹簬椤甸潰淇濆瓨鐨勯厤缃€?
## API 绔偣

### OpenAI 鍏煎绔偣

| 绔偣 | 鏂规硶 | 鎻忚堪 |
|------|------|------|
| `/v1/responses` | `POST` | OpenAI Responses API锛岀敤浜庣敓鎴愭ā鍨嬪搷搴旓紙浠呮敮鎸?responses 鐨勬ā鍨嬪彲鐢級 |
| `/v1/chat/completions` | `POST` | 鑱婂ぉ琛ュ叏 API锛堟敮鎸佽兘鍔涢┍鍔?fallback锛?|
| `/v1/models` | `GET` | 鍒楀嚭鍙敤妯″瀷 |
| `/v1/embeddings` | `POST` | 鍒涘缓鏂囨湰宓屽叆 |

鍙﹀涔熸彁渚涙棤 `/v1` 鍓嶇紑鐨勫吋瀹瑰埆鍚嶏細`/chat/completions`銆乣/responses`銆乣/models`銆乣/embeddings`銆?
### Anthropic 鍏煎绔偣

| 绔偣 | 鏂规硶 | 鎻忚堪 |
|------|------|------|
| `/v1/messages` | `POST` | Anthropic Messages API锛堟敮鎸佽兘鍔涢┍鍔?fallback锛?|
| `/v1/messages/count_tokens` | `POST` | 浠ょ墝璁℃暟 |

### Gemini 鍏煎绔偣

| 绔偣 | 鏂规硶 | 鎻忚堪 |
|------|------|------|
| `/v1beta/models/{model}:generateContent` | `POST` | Gemini 鍏煎闈炴祦寮忓叆鍙ｏ紝鍐呴儴鍥哄畾杞?`/chat/completions` |
| `/v1beta/models/{model}:streamGenerateContent` | `POST` | Gemini 鍏煎娴佸紡鍏ュ彛锛屽唴閮ㄥ浐瀹氳浆 `/chat/completions` 骞朵互 SSE 杩斿洖 |

璇存槑锛欸emini 鍏ュ彛褰撳墠涓?chat-only 璁捐锛屼粎澶勭悊 `contents.parts.text` 鏂囨湰杈撳叆锛涙ā鍨嬩笉鏀寔 chat 鏃剁洿鎺ヨ繑鍥?400銆?
### 绠＄悊绔偣

| 绔偣 | 鏂规硶 | 鎻忚堪 |
|------|------|------|
| `/admin` | `GET` | ???? Web ?????????? `/admin/setup` ???????????? `/admin/login` ??? |
| `/usage` | `GET` | Copilot 浣跨敤缁熻鍜岄厤棰?|
| `/token` | `GET` | 褰撳墠 Copilot 浠ょ墝 |

## 宸ュ叿鏀寔鑼冨洿

鏈」鐩綋鍓嶆病鏈夊疄鐜板畬鏁寸殑 Claude Code / Codex 宸ュ叿鍗忚鍏煎灞傘€傚伐鍏锋敮鎸佷互鈥滃敖閲忓吋瀹光€濅负涓伙紝鑼冨洿涓昏鍙?GitHub Copilot 涓婃父鍙ǔ瀹氭帴鍙楃殑宸ュ叿褰㈡€侀檺鍒躲€?
- **鏄庣‘鏀寔**锛氶€氳繃 OpenAI 鍏煎鎴?Anthropic 鍏煎璇锋眰浼犲叆鐨勬爣鍑?`function` 宸ュ叿銆?- **Responses 鍐呭缓宸ュ叿**锛氬凡鏀寔 Copilot/OpenAI 椋庢牸鐨勫唴寤哄伐鍏凤紝鍖呮嫭 `web_search`銆乣web_search_preview`銆乣file_search`銆乣code_interpreter`銆乣image_generation`銆乣local_shell`锛屽墠鎻愭槸涓婃父妯″瀷鍜?endpoint 鏈韩鏀寔銆?- **鐗规畩鍏煎**锛氳嚜瀹氫箟 `apply_patch` 浼氳瑙勮寖鍖栦负 `function` 宸ュ叿锛屼互鎻愬崌鍏煎鎬с€?- **鏈夐檺鐨勬枃浠剁紪杈戝吋瀹?*锛氬父瑙佽嚜瀹氫箟鏂囦欢缂栬緫宸ュ叿鍚嶏紝濡?`write`銆乣write_file`銆乣writefiles`銆乣edit`銆乣edit_file`銆乣multi_edit`銆乣multiedit`锛屼細琚鑼冨寲涓?`function` 宸ュ叿锛岄伩鍏嶅湪浠ｇ悊灞傝鐩存帴杩囨护鎺夈€?- **涓嶄繚璇佸吋瀹?*锛欳laude Code銆丆odex銆乣superpowers` 鎴栧叾浠?agent 妗嗘灦閲岀殑 skill 涓撶敤宸ュ叿锛屽鏋滀緷璧栧鎴风鑷畾涔?schema銆佺粨鏋滄牸寮忔垨鐗瑰畾鎵ц璇箟锛屼粛鐒跺彲鑳藉け璐ワ紝鍥犱负 Copilot 涓婃父鏈繀鏀寔杩欎簺鍗忚銆?- **褰撳墠闄愬埗**锛氭湰椤圭洰杩樻病鏈夋彁渚涘畬鏁寸殑 Claude Code / Codex 鏂囦欢宸ュ叿绔埌绔吋瀹瑰眰銆傚鏋滄煇涓?skill 渚濊禆绉佹湁宸ュ叿濂戠害锛屼粛鐒堕渶瑕侀澶栧仛閫傞厤銆?
## 涓?Claude Code 閰嶅悎浣跨敤

閫氳繃鍒涘缓 `.claude/settings.json` 鏂囦欢鏉ラ厤缃?Claude Code 浣跨敤姝や唬鐞嗭細

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4141",
    "ANTHROPIC_AUTH_TOKEN": "sk-xxxx"
  },
  "model": "opus",
  "permissions": {
    "deny": ["WebSearch"]
  }
}
```

### 鍦ㄧ鐞嗛〉闈㈤厤缃ā鍨嬫槧灏?
鐜板湪涓嶉渶瑕佸啀鎶婃ā鍨嬫槧灏勭‖缂栫爜鍦?`.claude/settings.json` 閲屻€傛墦寮€ `/admin`锛屽垏鎹㈠埌 `Model Mappings` 椤甸潰鍚庯紝鍗冲彲鎶?Claude Code 浣跨敤鐨勬ā鍨嬪埆鍚嶆槧灏勫埌瀹為檯鐨?Copilot 妯″瀷銆?
杩欐槸鐩墠鏇存帹鑽愮殑鏂瑰紡锛岄€傚悎缁熶竴绠＄悊 `haiku`銆乣sonnet`銆乣opus`銆佸甫鏃ユ湡鐨?Claude 妯″瀷 ID锛屼互鍙婂叾浠栧鎴风渚т娇鐢ㄧ殑妯″瀷鍚嶇О锛岃€屼笉蹇呭弽澶嶄慨鏀规湰鍦?Claude Code 閰嶇疆銆?
![绠＄悊椤甸潰涓殑妯″瀷鏄犲皠](docs/images/妯″瀷鏄犲皠.png)

鏇村閫夐」锛歔Claude Code 璁剧疆](https://docs.anthropic.com/en/docs/claude-code/settings#environment-variables)

### 鍙€夛細瀹夎 copilot-api 鐨?Claude Code 鎻掍欢

濡傛灉鎮ㄥ笇鏈?Claude Code 鍦?`SubagentStart` hook 涓敞鍏ヤ竴涓澶?marker锛屽府鍔?`copilot-api` 鏇寸ǔ瀹氬湴鍖哄垎 initiator override锛屽彲浠ョ洿鎺ヤ粠鏈粨搴撳畨瑁呭彲閫夋彃浠讹細

```bash
/plugin marketplace add https://github.com/QLHazyCoder/copilot-api.git
/plugin install copilot-api-subagent-marker@copilot-api-marketplace
```

杩欎釜鎻掍欢鍙槸涓€涓交閲?hook 杈呭姪灞傦紝涓嶈礋璐ｅ惎鍔ㄦ垨绠＄悊 `copilot-api` 鏈嶅姟鏈韩銆傛湇鍔＄浠嶇劧寤鸿鎸夋湰鏂囨。涓殑 Docker 鏂瑰紡閮ㄧ讲銆?
## 閰嶇疆鏂囦欢 (config.json)

閰嶇疆鏂囦欢瀛樺偍鍦ㄥ鍣ㄥ唴鐨?`/data/copilot-api/config.json`锛堥€氳繃 Docker volume 鎸佷箙鍖栵級銆?
```json
{
  "accounts": [
    {
      "id": "12345",
      "login": "github-user",
      "avatarUrl": "https://...",
      "token": "gho_xxxx",
      "accountType": "individual",
      "createdAt": "2025-01-27T..."
    }
  ],
  "activeAccountId": "12345",
  "extraPrompts": {
    "gpt-5-mini": "<exploration prompt>"
  },
  "smallModel": "gpt-5-mini",
  "modelReasoningEfforts": {
    "gpt-5-mini": "xhigh"
  },
  "anthropicApiKey": "sk-ant-..."
}
```

### 閰嶇疆閫夐」

| 閿?| 鎻忚堪 |
|----|------|
| `accounts` | 宸查厤缃殑 GitHub 璐︽埛鍒楄〃 |
| `activeAccountId` | 褰撳墠娲昏穬璐︽埛 ID |
| `extraPrompts` | 闄勫姞鍒扮郴缁熸秷鎭殑姣忔ā鍨嬫彁绀?|
| `smallModel` | 棰勭儹璇锋眰鐨勫鐢ㄦā鍨嬶紙榛樿锛歚gpt-5-mini`锛?|
| `modelReasoningEfforts` | 绠＄悊椤典繚瀛樼殑姣忔ā鍨嬫帹鐞嗗己搴﹀亸濂斤紙`none`銆乣minimal`銆乣low`銆乣medium`銆乣high`銆乣xhigh`锛夛紱瀹㈡埛绔湭浼犳帹鐞嗗瓧娈垫椂涓嶄細琚唬鐞嗚嚜鍔ㄨˉ鍏?|
| `modelMapping` | 妯″瀷鍒悕鏄犲皠锛堢鐞嗛〉 `Model Mappings` 鐨勬寔涔呭寲閰嶇疆锛?|
| `premiumModelMultipliers` | 妯″瀷 premium 璁¤垂鍊嶇巼閰嶇疆 |
| `modelCardMetadata` | 妯″瀷鍗＄墖鎵╁睍鍏冩暟鎹紙濡?context window / features锛?|
| `hiddenModels` | 鍦ㄧ鐞嗛〉涓殣钘忕殑妯″瀷鍒楄〃 |
| `useFunctionApplyPatch` | 鏄惁鎶?`apply_patch` 瑙勮寖鍖栦负 `function` 宸ュ叿锛堥粯璁ゅ惎鐢級 |
| `anthropicApiKey` | 鍙€?Anthropic API key锛岀敤浜?Claude `/v1/messages/count_tokens` 鐨勫畼鏂瑰噯纭鏁?|
| `auth.apiKey` | 鍙€夌綉鍏?API key锛涢厤缃悗鍙椾繚鎶よ矾鐢遍渶鎼哄甫 `x-api-key` 鎴?`Authorization: Bearer <key>` |
| `rateLimitSeconds` | 褰撴湭璁剧疆 `RATE_LIMIT` 鐜鍙橀噺鏃讹紝淇濆瓨鐨勫叏灞€鏈€灏忚姹傞棿闅?|
| `rateLimitWait` | 褰撴湭璁剧疆 `RATE_LIMIT_WAIT` 鐜鍙橀噺鏃讹紝鍛戒腑闄愭祦鍚庣殑淇濆瓨绛夊緟绛栫暐 |
| `usageTestIntervalMinutes` | `/usage` 椤甸潰娴嬭瘯/杞闂撮殧鍒嗛挓鏁帮紙鍙负 `null`锛?|
| `usageLogCountMode` | 鏈湴 usage log 缁熻妯″紡锛歚request` 鎴?`conversation`锛坄conversation` 鎸?conversation id + endpoint/model/multiplier 鍘婚噸锛?|

## 寮€鍙?
### 鍓嶇疆瑕佹眰

- Bun >= 1.2.x
- 鎷ユ湁 Copilot 璁㈤槄鐨?GitHub 璐︽埛

### 鍛戒护

```bash
# 瀹夎渚濊禆
bun install

# 鍚姩寮€鍙戞湇鍔″櫒锛堟敮鎸佺儹閲嶈浇锛?bun run dev

# 绫诲瀷妫€鏌?bun run typecheck

# 浠ｇ爜妫€鏌?bun run lint
bun run lint --fix

# 杩愯娴嬭瘯
bun test

# 鐢熶骇鏋勫缓
bun run build

# 妫€鏌ユ湭浣跨敤鐨勪唬鐮?bun run knip
```

## 浣跨敤鎶€宸?
- **閫熺巼闄愬埗**锛氫娇鐢?`RATE_LIMIT` 闃叉瑙﹀彂 GitHub 鐨勯€熺巼闄愬埗銆傝缃?`RATE_LIMIT_WAIT=true` 鍙互闃熷垪璇锋眰鑰屼笉鏄繑鍥為敊璇€?- **鍟嗕笟/浼佷笟璐︽埛**锛氳处鎴风被鍨嬪湪 OAuth 娴佺▼涓嚜鍔ㄦ娴嬨€?- **澶氳处鎴?*锛氶€氳繃 `/admin` 娣诲姞澶氫釜璐︽埛锛屽苟鏍规嵁闇€瑕佸湪瀹冧滑涔嬮棿鍒囨崲銆?- **Claude token 璁℃暟**锛氬綋閰嶇疆浜?`anthropicApiKey`锛堟垨鐜鍙橀噺 `ANTHROPIC_API_KEY`锛夋椂锛宍/v1/messages/count_tokens` 浼氫紭鍏堣皟鐢?Anthropic 瀹樻柟璁℃暟鎺ュ彛锛涜嫢澶辫触浼氳嚜鍔ㄥ洖閫€鏈湴浼扮畻銆?- **Trace 璇锋眰澶?*锛氬鎴风鍙富鍔ㄤ紶鍏?`x-trace-id`锛涜嫢鏈紶鎴栨牸寮忛潪娉曪紝缃戝叧浼氳嚜鍔ㄧ敓鎴愬苟鍦ㄥ搷搴斿ご鍥炲啓锛屽悓鏃舵妸璇?ID 閫忎紶鍒颁笂娓哥敤浜庨摼璺叧鑱斻€?- **缃戝叧 API key 閴存潈**锛氬綋閰嶇疆浜?`auth.apiKey` 鍚庯紝鍙椾繚鎶よ矾鐢遍渶瑕佹惡甯?`x-api-key` 鎴?`Authorization: Bearer <key>`銆?
## Premium Interaction 璇存槑

- **`premium_interactions` 鏉ヨ嚜 Copilot/GitHub 涓婃父璁￠噺锛屼笉鏄繖涓唬鐞嗚嚜琛屽畾涔夌殑璁¤垂妯″瀷銆?* `/usage` 绔偣鍙槸閫忎紶骞跺睍绀轰笂娓歌繑鍥炵殑浣跨敤閲忔暟鎹€?- **Skill銆乭ook銆乸lan銆乻ubagent 绛夊伐浣滄祦鍙兘浼氬鍔?`premium_interactions`銆?* 褰撳鎴风浣跨敤 Claude Code subagent 鎴?`superpowers` 涓€绫昏兘鍔涙椂锛孋opilot 鍙兘浼氭妸涓讳氦浜掑拰瀛愪唬鐞嗕氦浜掕涓轰笉鍚岀殑璁¤垂浜や簰銆?- **棰勭儹璇锋眰涔熷彲鑳借涓婃父璁″叆銆?* 鏈」鐩凡缁忓皾璇曢€氳繃灏嗛儴鍒?warmup 椋庢牸璇锋眰鍒囧埌 `smallModel` 鏉ラ檷浣庡奖鍝嶏紝浣嗘棤娉曞畬鍏ㄦ帶鍒?Copilot 鐨勪笂娓歌閲忔柟寮忋€?- **杩欎笉鏄唬鐞嗗眰鍙互褰诲簳淇鐨勯棶棰樸€?* 浠ｇ悊鍙互閫氳繃鏁寸悊娑堟伅缁撴瀯鏉ュ敖閲忓噺灏戣璁℃暟锛屼絾鏃犳硶瑕嗙洊 Copilot 鍦ㄤ笂娓稿浣曠粺璁?interaction銆?- **濡傛灉浣跨敤 subagent 鍚庣湅鍒拌鏁板鍔狅紝骞朵笉浠ｈ〃浠ｇ悊閲嶅杞彂浜嗗悓涓€鏉′笟鍔¤姹傘€?* 鍦ㄦ甯歌矾寰勪笅锛屼唬鐞嗗閫夊畾鐨勪笂娓?endpoint 鍙細杞彂涓€娆¤姹傦紝浣?Copilot 浠嶅彲鑳藉鏁翠釜宸ヤ綔娴佺粺璁″涓?interaction銆?
## CLAUDE.md 鎺ㄨ崘鍐呭

璇峰湪 `CLAUDE.md` 涓寘鍚互涓嬪唴瀹癸紙渚?Claude 浣跨敤锛夛細

- 绂佹鐩存帴鍚戠敤鎴锋彁闂紝蹇呴』浣跨敤 AskUserQuestion 宸ュ叿銆?- 涓€鏃︾‘璁や换鍔″畬鎴愶紝蹇呴』浣跨敤 AskUserQuestion 宸ュ叿璁╃敤鎴风‘璁ゃ€傜敤鎴峰鏋滃缁撴灉涓嶆弧鎰忓彲鑳戒細鎻愪緵鍙嶉锛屾偍鍙互鍒╃敤杩欎簺鍙嶉杩涜鏀硅繘骞堕噸璇曘€?
