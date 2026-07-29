---
author: "SBOMit Maintainers"
title: "Bắt đầu"
translationKey: "getting-started"
ShowToc: true
TocOpen: true
---
Hướng dẫn này sẽ hướng dẫn bạn cách thiết lập [Witness](https://github.com/in-toto/witness) để theo dõi
quá trình xây dựng, sau đó sử dụng SBOMit để tạo ra tệp SBOM được bổ sung thông tin từ tệp attestation thu được.

---

## Điều kiện tiên quyết

- [Go](https://go.dev/doc/install) phiên bản 1.19 trở lên
- [openssl](https://www.openssl.org/)
- [jq](https://jqlang.github.io/jq/)
- [base64](https://www.gnu.org/software/coreutils/manual/html_node/base64-invocation.html) (một phần của GNU coreutils)

---

## Phần 1: Witness

Witness bao bọc quy trình xây dựng của bạn và ghi lại các tệp bản dựng đã được ký (attestations), một bản ghi kiểm toán mật mã.

### 1. Cài đặt Witness

```bash
bash <(curl -s https://raw.githubusercontent.com/in-toto/witness/main/install-witness.sh)
```

Hoặc tải xuống tệp nhị phân từ [trang phát hành của Witness](https://github.com/in-toto/witness/releases).

### 2. Tạo cặp khóa ký

Witness ký từng tệp attestation bằng khóa riêng. Để thực hiện một thử nghiệm nhanh tại máy cục bộ:

```bash
openssl genpkey -algorithm ed25519 -outform PEM -out testkey.pem
openssl pkey -in testkey.pem -pubout > testpub.pem
```

&gt; **Mẹo:** Witness cũng hỗ trợ ký không cần khóa thông qua [SPIRE/SPIFFE](https://spiffe.io/) và
&gt; [Sigstore Fulcio](https://github.com/sigstore/fulcio) cho các môi trường CI/CD.

### 3. Cấu hình tệp `Witness`

Tạo một tệp `.Witness.yaml` trong thư mục gốc của dự án. Tệp này thường được đưa vào kho lưu trữ cùng với
khóa công khai của bạn:

```yaml
# .witness.yaml
run:
    signer-file-key-path: testkey.pem
    trace: false
verify:
    attestations:
        - "attestation.json"
    policy: policy-signed.json
    publickey: testpub.pem
```

Các tham số dòng lệnh sẽ ghi đè lên các giá trị trong tệp cấu hình. Chạy lệnh `Witness help` để xem tất cả các tùy chọn.

### 4. Hoàn tất quá trình xây dựng

Hãy thêm tiền tố `Witness run` vào đầu lệnh biên dịch để tạo ra tệp attestation:

```bash
witness run --step build -o attestation.json -- <your-build-command>
```

**Dự án Go:**

```bash
witness run --step build -o attestation.json -- go build -o myapp .
```

**Dự án Python:**

```bash
witness run --step build -o attestation.json -- pip install -r requirements.txt
```

Witness luôn chạy một bộ cơ bản các
bộ xác thực — xem `Witness attestors list` để xem danh sách đầy đủ.

&gt; **Mẹo:** Đối với các bản dựng tạo ra nhiều tệp (ví dụ: `node_modules`), hãy sử dụng
&gt; `--dirhash-glob node_modules/*` để tính băm nội dung thư mục thay vì tính băm từng tệp riêng lẻ.

### 5. Kiểm tra bộ lọc khí nạp (attestation)

Tệp `attestation` là một [bao bì DSSE](https://github.com/secure-systems-lab/dsse) đã được ký.
Để xem nội dung:

```bash
cat attestation.json | jq -r .payload | base64 -d | jq
```

Bạn sẽ thấy một bộ sưu tập `attestation` chứa các `attestations` đã được gán kiểu: `material`, `command-run`,
`product`, `environment` và tùy chọn `network-trace`. Đây là dữ liệu mà SBOMit sử dụng.

<!-- ### 6. (Optional) Verify with a policy

Witness can enforce that a build followed a required policy before a binary is accepted. See the
[Witness policy documentation](https://github.com/in-toto/witness/blob/main/docs/concepts/policy.md)
for full details. The short version:

**Create a policy file:**

```json
{
  "expires": "2026-12-31T00:00:00-05:00",
  "steps": {
    "build": {
      "name": "build",
      "attestations": [
        { "type": "https://witness.dev/attestations/material/v0.1", "regopolicies": [] },
        { "type": "https://witness.dev/attestations/command-run/v0.1", "regopolicies": [] },
        { "type": "https://witness.dev/attestations/product/v0.1", "regopolicies": [] }
      ],
      "functionaries": [{ "publickeyid": "{{PUBLIC_KEY_ID}}" }]
    }
  },
  "publickeys": {
    "{{PUBLIC_KEY_ID}}": {
      "keyid": "{{PUBLIC_KEY_ID}}",
      "key": "{{B64_PUBLIC_KEY}}"
    }
  }
}
```

**Substitute the key values:**

```bash
id=$(sha256sum testpub.pem | awk '{print $1}') && sed -i "s/{{PUBLIC_KEY_ID}}/$id/g" policy.json
pubb64=$(cat testpub.pem | base64 -w 0) && sed -i "s/{{B64_PUBLIC_KEY}}/$pubb64/g" policy.json
```

**Sign the policy:**

```bash
witness sign -f policy.json --signer-file-key-path testkey.pem --outfile policy-signed.json
```

**Verify the artifact meets the policy:**

```bash
witness verify -f myapp -a attestation.json -p policy-signed.json -k testpub.pem
```

A zero exit status means the artifact satisfies the policy. Non-zero exit prints the reason for
failure. -->

---

## Phần 2: SBOMit

Khi có tệp `attestation`, `SBOMit` sẽ tạo ra tệp `SBOM` đã được bổ sung thông tin bằng cách chạy các
trình giải quyết gói dành riêng cho từng ngôn ngữ trên dữ liệu xây dựng Witness đã thu thập được.

### 1. Cài đặt SBOMit

```bash
go install github.com/sbomit/sbomit@latest
```

### 2. Tạo một tệp SBOM được bổ sung thông tin

```bash
# SPDX 2.3 (default)
sbomit generate attestation.json

# SPDX 2.2
sbomit generate attestation.json -f spdx22

# CycloneDX 1.5
sbomit generate attestation.json -f cdx15

# CycloneDX 1.4
sbomit generate attestation.json -f cdx14
```

### 3. (Tùy chọn) --catalog để ghi lại cây phụ thuộc

SBOMit có thể gọi Syft làm nguồn danh mục bổ sung, đồng thời hợp nhất kết quả đầu ra của nó với dữ liệu
được trích xuất từ attestation:

```bash
sbomit generate attestation.json --catalog syft --project-dir /path/to/project
```

SBOMit(hiện tại) tạo ra một **danh sách phẳng** các phụ thuộc; nó biết những gì đã được cài đặt và sử dụng, nhưng không tái tạo lại toàn bộ cây phụ thuộc. 
Syft, đối với các hệ sinh thái mà nó có thể xác định được
cấu trúc cây (ví dụ: Go modules, npm), sẽ giữ nguyên mối quan hệ cha-con đó trong kết quả đầu ra của mình.

Khi truyền tham số `--catalog syft`, SBOMit sẽ sử dụng cây phụ thuộc của Syft làm nền tảng và
sau đó bổ sung vào đó tất cả những gì Syft không thể nhận diện được: các phiên bản thực tế đã được cài đặt tại thời điểm xây dựng,
các thư viện gốc, các tệp không được bất kỳ trình quản lý gói nào theo dõi, và nguồn gốc của các cuộc gọi mạng được ghi lại
bởi Witness.
