// 練習 1：@Catch(DomainError) 的 filter，依 exception.code 決定狀態碼
//   OUT_OF_STOCK → 409、PRODUCT_NOT_FOUND → 404、其他 code → 422
//   回應：{ statusCode, error, message, errorCode, details, requestId }
export class DomainExceptionFilter {}
