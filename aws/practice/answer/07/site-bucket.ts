// 練習 2：放 Vue 網站的私有 bucket：擋公開、開版本控制、SSE-KMS＋bucket key、拒絕非 HTTPS
import {
  CreateBucketCommand, PutBucketEncryptionCommand, PutBucketPolicyCommand, PutBucketVersioningCommand,
  PutPublicAccessBlockCommand, S3Client, type BucketLocationConstraint,
} from '@aws-sdk/client-s3'

export async function secureSiteBucket(s3: S3Client, bucket: string, kmsKeyArn: string): Promise<void> {
  const region = await s3.config.region()
  await s3.send(new CreateBucketCommand({
    Bucket: bucket,
    ...(region === 'us-east-1' ? {} : { CreateBucketConfiguration: { LocationConstraint: region as BucketLocationConstraint } }),
  }))
  await s3.send(new PutPublicAccessBlockCommand({
    Bucket: bucket,
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true },
  }))
  await s3.send(new PutBucketVersioningCommand({ Bucket: bucket, VersioningConfiguration: { Status: 'Enabled' } }))
  await s3.send(new PutBucketEncryptionCommand({
    Bucket: bucket,
    ServerSideEncryptionConfiguration: {
      Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'aws:kms', KMSMasterKeyID: kmsKeyArn }, BucketKeyEnabled: true }],
    },
  }))
  await s3.send(new PutBucketPolicyCommand({
    Bucket: bucket,
    Policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Sid: 'DenyInsecureTransport',
        Effect: 'Deny',
        Principal: '*',
        Action: 's3:*',
        Resource: [`arn:aws:s3:::${bucket}`, `arn:aws:s3:::${bucket}/*`],
        Condition: { Bool: { 'aws:SecureTransport': 'false' } },
      }],
    }),
  }))
}
