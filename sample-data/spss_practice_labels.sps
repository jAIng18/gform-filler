* Dữ liệu NGẪU NHIÊN chỉ để tập SPSS. Không dùng cho khóa luận.
* Sửa đường dẫn FILE bên dưới nếu bạn di chuyển file CSV.
GET DATA
  /TYPE=TXT
  /FILE='C:\Users\Admin\Desktop\google_form_spam\sample-data\spss_practice_200.csv'
  /ENCODING='UTF8'
  /ARRANGEMENT=DELIMITED
  /DELIMITERS=','
  /FIRSTCASE=2
  /VARIABLES=
  ID F4.0
  GIOITINH F1.0
  DOTUOI F1.0
  HOCVAN F1.0
  NGHENGHIEP F1.0
  THUNHAP F1.0
  TANSUAT F1.0
  PTTT_1 F1.0
  PTTT_2 F1.0
  PTTT_3 F1.0
  PTTT_4 F1.0
  PTTT_5 F1.0
  PTTT_6 F1.0
  BIET F1.0
  DUDINH F1.0
  TT1 F1.0
  TT2 F1.0
  TT3 F1.0
  TD1 F1.0
  TD2 F1.0
  TD3 F1.0
  LI1 F1.0
  LI2 F1.0
  LI3 F1.0
  LI4 F1.0
  DD1 F1.0
  DD2 F1.0
  DD3 F1.0
  DD4 F1.0
  AH1 F1.0
  AH2 F1.0
  AH3 F1.0
  AH4 F1.0
  DK1 F1.0
  DK2 F1.0
  DK3 F1.0
  DK4 F1.0
  CP1 F1.0
  CP2 F1.0
  AT1 F1.0
  AT2 F1.0
  AT3 F1.0
  AT4 F1.0
  YD1 F1.0
  YD2 F1.0
  YD3 F1.0
  YD4 F1.0
  .
DATASET NAME TapSPSS WINDOW=FRONT.

VARIABLE LABELS
  ID 'Mã người trả lời'
  /GIOITINH 'Giới tính của bạn là?'
  /DOTUOI 'Độ tuổi của bạn là?'
  /HOCVAN 'Trình độ học vấn hiện tại của bạn?'
  /NGHENGHIEP 'Nghề nghiệp hiện tại của bạn?'
  /THUNHAP 'Thu nhập trung bình hằng tháng của bạn?'
  /TANSUAT 'Tần suất sử dụng thanh toán bằng mã QR qua điện thoại (ứng dụng ngân hàng/ví điện tử) của bạn?'
  /PTTT_1 'PTTT: Tiền mặt'
  /PTTT_2 'PTTT: Thẻ ngân hàng nội địa (ATM/Napas)'
  /PTTT_3 'PTTT: Thẻ thanh toán quốc tế (Visa/Mastercard/JCB...)'
  /PTTT_4 'PTTT: Chuyển khoản hoặc quét mã QR qua ứng dụng ngân hàng'
  /PTTT_5 'PTTT: Ví điện tử (MoMo, ZaloPay, ShopeePay...)'
  /PTTT_6 'PTTT: Khác'
  /BIET 'Trước khi tham gia khảo sát này, bạn đã từng biết đến dịch vụ thanh toán QR ở nước ngoài (dùng ứng dụng ngân hàng/ví điện tử Việt Nam để quét mã QR thanh toán ở nước ngoài) chưa?'
  /DUDINH 'Bạn có dự định đi du lịch Trung Quốc trong thời gian tới không?'
  /TT1 'Tôi tin rằng thanh toán QR qua ứng dụng ngân hàng hoặc ví điện tử Việt Nam rất thuận tiện trong chuyến đi Trung Quốc của tôi.'
  /TT2 'Tôi tin rằng mình có thể thanh toán QR tại nhiều địa điểm khác nhau ở Trung Quốc.'
  /TT3 'Tôi tin rằng việc thanh toán QR sẽ giúp tôi giảm nhu cầu mang theo tiền mặt và nhiều thẻ ngân hàng khi mua sắm tại Trung Quốc.'
  /TD1 'Tôi tin rằng việc thanh toán QR sẽ giúp giao dịch được hoàn tất nhanh chóng hơn ở Trung Quốc.'
  /TD2 'Tôi tin rằng việc thanh toán QR sẽ giúp tôi giảm thời gian dành cho quá trình thanh toán khi mua sắm tại Trung Quốc.'
  /TD3 'So với thanh toán bằng tiền mặt và thẻ ngân hàng quốc tế, tôi tin rằng thanh toán QR có thể giúp tôi hoàn tất giao dịch nhanh hơn.'
  /LI1 'Tôi tin rằng việc thanh toán QR qua ứng dụng ngân hàng hoặc ví điện tử Việt Nam sẽ hữu ích trong việc đáp ứng các nhu cầu thanh toán của tôi trong chuyến đi Trung Quốc.'
  /LI2 'Tôi tin rằng việc sử dụng phương thức thanh toán này sẽ giúp tôi thực hiện các giao dịch thanh toán khi mua sắm hiệu quả hơn.'
  /LI3 'Tôi tin rằng việc sử dụng phương thức thanh toán này sẽ cải thiện trải nghiệm du lịch của tôi tại Trung Quốc thông qua việc hỗ trợ các hoạt động thanh toán hằng ngày.'
  /LI4 'Tôi tin rằng phương thức thanh toán này sẽ mang lại lợi ích cho các hoạt động mua sắm và chi tiêu khác nhau trong chuyến đi Trung Quốc của tôi.'
  /DD1 'Dựa trên kinh nghiệm sử dụng ứng dụng ngân hàng hoặc ví điện tử, tôi tin rằng việc tìm kiếm và truy cập chức năng thanh toán QR ở Trung Quốc sẽ dễ dàng đối với tôi.'
  /DD2 'Tôi tin rằng các bước cần thực hiện để thanh toán QR ở Trung Quốc sẽ rõ ràng và dễ hiểu đối với tôi.'
  /DD3 'Tôi tin rằng việc thanh toán QR ở Trung Quốc sẽ dễ dàng đối với tôi.'
  /DD4 'Tôi tin rằng mình có thể nhanh chóng thành thạo việc sử dụng thanh toán QR ở nước ngoài qua ứng dụng ngân hàng hoặc ví điện tử Việt Nam.'
  /AH1 'Bạn bè của tôi cho rằng tôi nên sử dụng thanh toán QR qua ứng dụng ngân hàng hoặc ví điện tử Việt Nam khi đi Trung Quốc.'
  /AH2 'Gia đình tôi cho rằng tôi nên sử dụng phương thức thanh toán QR khi đi Trung Quốc.'
  /AH3 'Những người có ảnh hưởng đến hành vi của tôi sẽ khuyến khích tôi sử dụng phương thức thanh toán QR khi đi Trung Quốc.'
  /AH4 'Việc sử dụng phương thức thanh toán này khi đi Trung Quốc sẽ giúp tôi thể hiện hình ảnh hiện đại và am hiểu công nghệ trong mắt người khác.'
  /DK1 'Tôi tin rằng mình sẽ có đầy đủ các nguồn lực cần thiết, chẳng hạn như điện thoại tương thích và kết nối internet, để sử dụng phương thức thanh toán QR tại Trung Quốc.'
  /DK2 'Dựa trên kinh nghiệm sử dụng ứng dụng ngân hàng hoặc ví điện tử ở Việt Nam hiện tại, tôi tin rằng mình có đủ kiến thức và kỹ năng cơ bản để sử dụng thanh toán QR ở Trung Quốc.'
  /DK3 'Tôi tin rằng mình có thể tìm được nguồn hỗ trợ phù hợp nếu gặp thắc mắc hoặc khó khăn khi sử dụng phương thức thanh toán QR tại Trung Quốc.'
  /DK4 'Tôi tin rằng phương thức thanh toán QR ở Trung Quốc thông qua ứng dụng ngân hàng hoặc ví điện tử Việt Nam sẽ tương thích với điện thoại và các công nghệ mà tôi thường sử dụng.'
  /CP1 'Tôi tin rằng việc thanh toán QR ở Trung Quốc thông qua ứng dụng ngân hàng hoặc ví điện tử Việt Nam sẽ giúp tôi giảm chi phí thanh toán so với sử dụng thẻ ngân hàng quốc tế.'
  /CP2 'So với thẻ ngân hàng quốc tế, tôi cho rằng hình thức thanh toán QR sẽ mang lại lợi thế kinh tế tốt hơn khi đáp ứng cùng một nhu cầu thanh toán tại Trung Quốc.'
  /AT1 'Tôi tin rằng nguy cơ người khác tự ý can thiệp vào các giao dịch thanh toán QR của tôi ở Trung Quốc là thấp.'
  /AT2 'Tôi tin rằng nguy cơ thông tin lịch sử giao dịch của tôi bị sử dụng sai mục đích khi thanh toán QR ở Trung Quốc là thấp.'
  /AT3 'Tôi tin rằng sử dụng thanh toán QR qua ứng dụng ngân hàng hoặc ví điện tử Việt Nam là một phương thức an toàn để thực hiện giao dịch thanh toán tại Trung Quốc.'
  /AT4 'Tôi tin rằng nguy cơ thông tin liên quan đến tài khoản thanh toán của tôi (ví dụ: thông tin tài khoản ngân hàng hoặc ví điện tử) bị sử dụng sai mục đích khi thanh toán QR xuyên biên giới là thấp.'
  /YD1 'Tôi có ý định thử sử dụng thanh toán QR qua ứng dụng ngân hàng hoặc ví điện tử Việt Nam khi đi Trung Quốc.'
  /YD2 'Tôi có ý định sử dụng phương thức thanh toán này trong chuyến đi Trung Quốc nhiều hơn.'
  /YD3 'Tôi sẽ ưu tiên phương thức thanh toán này hơn các phương thức thanh toán truyền thống như tiền mặt hoặc thẻ ngân hàng quốc tế.'
  /YD4 'Nếu có cơ hội, tôi sẽ giới thiệu phương thức thanh toán QR qua ứng dụng ngân hàng hoặc ví điện tử Việt Nam cho người khác khi họ đi Trung Quốc.'
  .

VALUE LABELS
  GIOITINH 1 'Nam' 2 'Nữ' 3 'Khác'
  /
  DOTUOI 1 'Dưới 18 tuổi' 2 'Từ 18 đến 24 tuổi' 3 'Từ 25 đến 34 tuổi' 4 'Từ 35 đến 44 tuổi' 5 'Từ 45 đến 54 tuổi' 6 'Từ 55 tuổi trở lên'
  /
  HOCVAN 1 'Trung học phổ thông trở xuống' 2 'Trung cấp / Cao đẳng' 3 'Đại học' 4 'Sau đại học'
  /
  NGHENGHIEP 1 'Học sinh / Sinh viên' 2 'Nhân viên văn phòng' 3 'Công chức / Viên chức' 4 'Kinh doanh tự do / Chủ doanh nghiệp' 5 'Lao động tự do / Freelancer' 6 'Nội trợ / Nghỉ hưu' 7 'Khác'
  /
  THUNHAP 1 'Dưới 5 triệu đồng' 2 'Từ 5 đến dưới 10 triệu đồng' 3 'Từ 10 đến dưới 20 triệu đồng' 4 'Từ 20 đến dưới 30 triệu đồng' 5 'Từ 30 triệu đồng trở lên'
  /
  TANSUAT 1 'Hằng ngày' 2 'Vài lần mỗi tuần' 3 'Vài lần mỗi tháng' 4 'Hiếm khi (ít hơn 1 lần/tháng)' 5 'Chưa bao giờ sử dụng'
  /
  BIET 1 'Đã biết và đã từng sử dụng' 2 'Đã biết nhưng chưa từng sử dụng' 3 'Chưa từng biết đến'
  /
  DUDINH 1 'Có, trong vòng 6 tháng tới' 2 'Có, trong khoảng 6 đến 12 tháng tới' 3 'Có thể, nhưng chưa có kế hoạch cụ thể' 4 'Không có dự định'
  /
  PTTT_1 PTTT_2 PTTT_3 PTTT_4 PTTT_5 PTTT_6 0 'Không chọn' 1 'Có chọn'
  /
  TT1 TT2 TT3 TD1 TD2 TD3 LI1 LI2 LI3 LI4 DD1 DD2 DD3 DD4 AH1 AH2 AH3 AH4 DK1 DK2 DK3 DK4 CP1 CP2 AT1 AT2 AT3 AT4 YD1 YD2 YD3 YD4 1 'Hoàn toàn không đồng ý' 2 'Không đồng ý' 3 'Trung lập' 4 'Đồng ý' 5 'Hoàn toàn đồng ý'
  .

VARIABLE LEVEL
  GIOITINH DOTUOI HOCVAN NGHENGHIEP THUNHAP TANSUAT PTTT_1 PTTT_2 PTTT_3 PTTT_4 PTTT_5 PTTT_6 BIET DUDINH (NOMINAL)
  /TT1 TT2 TT3 TD1 TD2 TD3 LI1 LI2 LI3 LI4 DD1 DD2 DD3 DD4 AH1 AH2 AH3 AH4 DK1 DK2 DK3 DK4 CP1 CP2 AT1 AT2 AT3 AT4 YD1 YD2 YD3 YD4 (SCALE).

MRSETS
  /MDGROUP NAME=$PTTT LABEL='Phương thức thanh toán thường dùng' CATEGORYLABELS=VARLABELS
   VARIABLES=PTTT_1 PTTT_2 PTTT_3 PTTT_4 PTTT_5 PTTT_6 VALUE=1.
EXECUTE.
