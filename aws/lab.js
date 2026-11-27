// AWS 雲端服務實戰 課：課程清單。練習引擎在 ../code.js（瀏覽器練習）和 ../local.js（本機練習）
import { startLesson } from '../course.js'

export const KEY = 'aws-progress'
export const STAGES = [
  ['階段 1：帳號與身分', [
    [1, '雲端與 AWS 全貌：region、責任分工、三種操作方式與帳單', '01-aws-big-picture.html'],
    [2, '帳號與 IAM 延伸：SSO 設定檔、CloudTrail、跨帳號 role、permission boundary 與提權路徑', '02-account-iam.html'],
  ], 'sheets/stage-1.html'],
  ['階段 2：網路與入口', [
    [3, 'VPC 與「為什麼連不到」：route table、NAT、安全群組、NACL、VPC endpoint 與排查順序', '03-vpc-connectivity.html'],
    [4, '對外入口：Route 53、ACM、ALB 與 CloudFront', '04-edge.html'],
  ], 'sheets/stage-2.html'],
  ['階段 3：運算', [
    [5, '容器上 AWS：ECR、ECS Fargate、task role 與 execution role', '05-ecs-fargate.html'],
    [6, 'Lambda 與 API Gateway：handler、冷啟動、並行、HTTP API 與授權', '06-lambda-api-gateway.html'],
  ], 'sheets/stage-3.html'],
  ['階段 4：資料與機密', [
    [7, 'S3 深入：policy、版本、加密、靜態網站與 CloudFront OAC', '07-s3-deep-dive.html'],
    [8, 'RDS 與 Aurora：Multi-AZ、read replica、備份與 PITR、RDS Proxy、連線數', '08-rds-aurora.html'],
    [9, '機密與加密：KMS、envelope encryption、Secrets Manager 與 Parameter Store', '09-kms-secrets.html'],
  ], 'sheets/stage-4.html'],
  ['階段 5：事件與上線', [
    [10, 'SQS、SNS、EventBridge 與 S3 事件：visibility timeout、DLQ、fan-out 與冪等', '10-messaging.html'],
    [11, '期末專題：把作品部署上 AWS', '11-capstone.html'],
  ], 'sheets/stage-5.html'],
]
export const LESSONS = STAGES.flatMap(([, list]) => list)

if (document.body.dataset.lesson) startLesson(LESSONS, KEY, STAGES)
