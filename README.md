# Rift Meta VN

Website phân tích meta League of Legends: tier list, đề xuất nên/không nên chơi, counter pick, Data Dragon và Riot Patch Notes.

## 1. Chạy ngay

```bash
npm install
cp .env.example .env
npm run dev
```

Mở `http://localhost:3000`.

Không có API key vẫn chạy được. Lúc này site dùng `data/meta-seed.json` và hiển thị badge **DEMO DATA**.

## 2. Kết nối Riot API

Tạo development key trên Riot Developer Portal rồi thêm vào `.env`:

```env
RIOT_API_KEY=RGAPI-...
RIOT_PLATFORM=vn2
RIOT_REGION=sea
RIOT_IDS=TenNguoiChoi#VN2,TenKhac#VN2
MATCHES_PER_PLAYER=20
```

Không bao giờ đưa `RIOT_API_KEY` vào `public/app.js` hoặc frontend.

## 3. Thu thập trận và tạo meta thật

```bash
npm run collect
npm run aggregate
```

- `collect` dùng Account-V1 để đổi Riot ID -> PUUID, sau đó lấy Ranked Solo/Duo Match-V5.
- Match JSON lưu ở `data/matches/`.
- `aggregate` tạo `data/meta.json` gồm champion-role, win rate, pick rate và matchup.
- Server tự ưu tiên `meta.json`; nếu chưa có sẽ fallback `meta-seed.json`.

## 4. Làm dataset đáng tin hơn

Bản collector mẫu chỉ lấy lịch sử các Riot ID bạn nhập. Để làm website public nghiêm túc:

1. Lấy sample người chơi Challenger/Grandmaster/Master theo từng region/rank.
2. Thu thập hàng nghìn trận mỗi patch thay vì vài chục trận.
3. Chống duplicate match ID.
4. Lưu PostgreSQL thay vì JSON file.
5. Tính thống kê theo `patch + rank + role + region`.
6. Chỉ công bố counter khi matchup có sample tối thiểu (ví dụ >= 100 trận).
7. Lưu lịch sử patch để tính `trend` thay vì đặt 0.
8. Tính ban rate từ champion select dataset nếu nguồn/API cho phép; script mẫu đang để 0 với dữ liệu Match-V5.

## 5. Cấu trúc

```text
lol-meta-analyzer/
├─ public/
│  ├─ index.html
│  ├─ style.css
│  └─ app.js
├─ scripts/
│  ├─ collect.js
│  └─ aggregate.js
├─ data/
│  └─ meta-seed.json
├─ server.js
├─ package.json
└─ .env.example
```

## Ghi chú dữ liệu

Data Dragon cung cấp dữ liệu/asset tướng, item, rune... và có thể chậm hơn patch live một chút. Riot Match-V5 cung cấp dữ liệu trận; Riot không cung cấp trực tiếp một endpoint "meta tier list/counter win rate", nên sản phẩm phải tự tổng hợp dữ liệu trận hoặc dùng nguồn thống kê hợp pháp khác.
