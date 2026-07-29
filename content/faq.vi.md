---
author: "SBOMit Maintainers"
title: "Câu hỏi thường gặp"
translationKey: "faq"
ShowToc: true
TocOpen: false
---
## Tại sao chúng ta cần các số liệu thống kê chính xác về “SBOMs”?

Khi lỗ hổng [Log4Shell (CVE-2021-44228)](https://nvd.nist.gov/vuln/detail/CVE-2021-44228) bùng phát vào tháng 12
năm 2021, số lượng hệ thống bị ảnh hưởng đã tăng vọt từ 40.000 lên 830.000 chỉ trong vòng chưa đầy 72 giờ. Log4j đã
bị ẩn đi dưới dạng một phụ thuộc gián tiếp, và hầu hết các nhóm không có cách nào để biết liệu họ có đang chạy nó hay không và ở đâu. Việc ứng phó sự cố đã biến thành một dự án rà soát trên toàn tổ chức.

{{< figure src="/images/log4shell-growth.png" alt="Log4Shell affected systems grew from 40,000 to 830,000 in 72 hours" caption="Affected systems in the 72 hours following the Log4Shell outbreak." >}}

Log4Shell đã minh chứng rõ ràng cho tầm quan trọng của việc lập danh mục phần mềm (SBOMs): nếu bạn có một danh mục đầy đủ và chính xác về mọi
thành phần trong phần mềm của mình, bạn có thể trả lời câu hỏi “chúng ta có bị ảnh hưởng không?” chỉ trong vài phút. Kể từ đó, việc lập danh mục phần mềm (SBOMs) đã
được quy định bắt buộc thông qua các sắc lệnh hành pháp, yêu cầu mua sắm và các khung tiêu chuẩn ngành. 
Câu hỏi hiện nay là liệu các bản danh mục thành phần phần mềm (SBOMs) đang được tạo ra có đủ chính xác để thực sự sử dụng hay không,
và đối với hầu hết các tổ chức hiện nay, câu trả lời là không. Khi lỗ hổng Log4Shell tiếp theo xuất hiện, liệu bản danh mục thành phần phần mềm (SBOM) của bạn có thể trả lời câu hỏi đó không, và bạn có tin tưởng vào nó không?

---

## Trình quản lý gói/tệp manifest của bạn không thể nhận diện được những gì?

Nhiều hơn bạn tưởng. Chúng tôi đã phân tích 1.000 hình ảnh dựa trên Debian hàng đầu trên Docker Hub và phát hiện ra rằng
một tỷ lệ đáng kể các tệp trong nhiều hình ảnh (đôi khi lên tới 40–100%) hoàn toàn không thể xác định được nguồn gốc từ bất kỳ
trình quản lý gói nào.

{{< figure src="/images/dark-matter-dockerhub.png" alt="Distribution of untracked files across top 1,000 Docker Hub images" caption="Distribution of files unaccounted for by the package manager across the top 1,000 Debian-based Docker Hub images." >}}

Đây là những tệp thực, được tải trong quá trình chạy, có khả năng bị lỗ hổng và không thể phát hiện được bởi bất kỳ công cụ SBOM nào
dựa trên trình quản lý gói metadata. Nghiên cứu của chúng tôi đã phát hiện ra các lỗ hổng CVE có thể bị khai thác trong số đó:

- **CVE-2025-32754** (`jenkins/ssh-agent`) — Các khóa SSH được tạo ra tại thời điểm xây dựng hình ảnh, do đó mọi
  container được tạo ra từ hình ảnh đó đều sử dụng chung các khóa này. Kẻ tấn công có thể kết nối vào một
  container xây dựng, đọc thông tin bí mật của quá trình xây dựng và rời đi mà không để lại dấu vết.
- **CVE-2025-32111** (`acme.sh`) — thông tin bí mật của quá trình xây dựng đã bị rò rỉ trong quá trình xây dựng. Kẻ tấn công
  nếu có được thông tin bí mật này có thể thay thế một client Let's Encrypt được sử dụng rộng rãi và thực hiện các cuộc tấn công man-in-the-middle
  trên một phần đáng kể lưu lượng truy cập internet.

Một trình quét chạy trên hình ảnh cuối cùng sẽ không phát hiện được những chi tiết này. Công cụ “SBOMit” ghi lại chúng vì
công cụ “Witness” theo dõi quá trình xây dựng ngay khi nó diễn ra.

---

## “in-toto”, “Witness” và “attestations” là gì?

**[in-toto](https://in-toto.io/)** là một khung công nghệ của CNCF nhằm bảo đảm an ninh cho chuỗi cung ứng phần mềm. Khung này
xác định một tiêu chuẩn để ghi lại và xác minh các bước trong quá trình phát triển phần mềm, bao gồm người thực hiện
mỗi bước, các tệp tin được xử lý và kết quả đầu ra. Mỗi bước được ghi lại dưới dạng một
bản tuyên bố có chữ ký và chống giả mạo về những gì đã xảy ra, được ký bởi bên đã thực hiện bước đó.

**[Witness](https://github.com/in-toto/witness)** là một triển khai của giao thức xác thực mã nguồn (in-toto) giúp tích hợp
vào quy trình xây dựng của bạn để tự động tạo ra các tệp xác thực mã nguồn (attestations). Bạn chỉ cần bao bọc lệnh xây dựng của mình bằng
`Witness run` và công cụ này sẽ ghi lại một bộ sưu tập các tệp xác thực mã nguồn đã được ký (attestation) cho bước đó.
Witness được phát triển bởi TestifySec và đóng góp cho hệ sinh thái CNCF in-toto.

**Các bản ghi attestations** là các nguyên tố cốt lõi. Mỗi bản ghi là một bản ghi có dấu của một bước xây dựng, bao gồm:

| attestation | Dữ liệu thu thập |
|---|---|
| `material` | Các tệp đầu vào và giá trị băm của chúng (dữ liệu đầu vào) |
| `command-run` | Các lệnh đã chạy, các tệp đã mở, các tiến trình đã khởi tạo |
| `product` | Các tệp đầu ra và các giá trị băm của chúng (kết quả đầu ra) |
| `environment` | Hệ điều hành, môi trường chạy, phiên bản công cụ |
| `network-trace` | Tất cả các kết nối mạng đi trong suốt bước này |

Vì mỗi tệp attestation đều được ký số tại thời điểm bước đó được thực thi, nên lịch sử xây dựng có thể
được xác minh bằng phương pháp mật mã.

Để biết thêm thông tin về chủ đề này, vui lòng tham khảo bài viết [in-toto mang lại những lợi ích gì](https://in-toto.io/in-toto/) trên trang web in-toto.

---

## SBOMit hoạt động như thế nào?

Công cụ `SBOMit` đọc tệp Witness attestation và:

1. Phân tích tất cả các loại tệp nhật ký xây dựng (attestation) để xây dựng bức tranh toàn cảnh về những gì đã xảy ra trong quá trình xây dựng
2. Chạy **các trình giải quyết gói dành riêng cho từng ngôn ngữ** (Python, Go, Rust, JavaScript/pnpm) để ánh xạ
   các đường dẫn tệp được quan sát trở lại tên gói và phiên bản chính xác
3. Loại bỏ các thành phần tạm thời/bộ nhớ đệm và loại bỏ các tham chiếu gói trùng lặp
4. Xuất ra tệp **SPDX** (2.2/2.3) hoặc **CycloneDX** (1.4/1.5) tiêu chuẩn SBOM được bổ sung bằng
   dữ liệu quan sát được trong quá trình xây dựng

Kết quả là tệp `SBOM` phản ánh chính xác những gì đã được cài đặt và sử dụng, bao gồm các phiên bản chính xác, các thư viện gốc và các tệp mà trình quản lý gói không thể phát hiện. Xem [Hướng dẫn Bắt đầu](/getting-started) để biết cách cài đặt và sử dụng.

---

## Nếu chuỗi cung ứng của tôi có những khâu không an toàn thì sao?

attestations không thể thay thế cho các quy trình xây dựng an toàn, mà chỉ là bản ghi lại những gì
đã xảy ra, chứ không phải là sự đảm bảo rằng những gì đã xảy ra là an toàn. Nếu quá trình xây dựng của bạn tải về một tập lệnh từ
internet và thực thi nó, Witness sẽ xác nhận một cách trung thực rằng điều này đã xảy ra.

attestations mang lại cho bạn **khả năng theo dõi và tính minh bạch**. Lệnh `network-trace` attestation
sẽ hiển thị kết nối đi bất thường đó. Lệnh `command-run` attestation sẽ ghi lại
quá trình đã tạo ra kết nối đó. Không thể che giấu bất cứ điều gì sau khi sự việc xảy ra, bởi vì các tệp attestations đã được ký số tại
thời điểm biên dịch.

Đối với các nhóm muốn áp dụng các chính sách bổ sung như yêu cầu các bản dựng chỉ lấy mã nguồn từ
các kho lưu trữ đã được phê duyệt, đảm bảo các bước nhất định luôn được ký bằng các khóa cụ thể, hoặc không có
quá trình bất thường nào được thực thi, [Witness
xác minh chính sách](https://github.com/in-toto/witness/blob/main/docs/concepts/policy.md)
và các khung công cụ như [SLSA
](https://slsa.dev/) xây dựng các quy tắc bảo mật có định hướng dựa trênin-toto

attestations
.SBOMit
có thể được sử dụng cùng với hệ thống chấm điểm tuân thủSLSA
để cung cấp một
bức tranh toàn diện về cả những gì có trong phần mềm và cách thức nó được sản xuất.

---

## Sự khác biệt giữa việc ký tên vào “SBOM” và việc sử dụng “SBOMit” là gì?

Việc ký kết một tệp tin “SBOM” mang lại **tính toàn vẹn**, đảm bảo rằng bạn biết tài liệu đó chưa bị can thiệp kể từ khi
được ký. Nội dung có thể đã sai hoặc không đầy đủ ngay từ
đầu, và bạn đang tin tưởng vào tuyên bố của một bên duy nhất về phần mềm tại một thời điểm cụ thể
nào đó. Nếu khóa ký bị lộ, hoặc nếu người ký mắc lỗi, tệp SBOM đã ký sẽ
trở nên vô giá trị.

Với SBOMit và Witness, mỗi tệp attestation đều được ký **tại thời điểm bước xây dựng được thực thi**, bởi
quy trình thực hiện bước đó. Bạn không phải tin tưởng vào lời khẳng định sau sự việc của một bên nào đó, mà thay vào đó, bạn có
bằng chứng mật mã độc lập từ mọi bước trong chuỗi cung ứng. Những sai sót vô tình
(một bước bị bỏ qua, một phụ thuộc bị thay thế một cách âm thầm) đều có thể phát hiện được vì chúng làm gián đoạn
chuỗi attestation. Việc can thiệp cố ý sẽ khó che giấu hơn đáng kể.
