// empty-bucket.js - Empties the entire S3 bucket
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = 'client.landing.page';

async function emptyBucket() {
    console.log(`\n⚠️  EMPTYING BUCKET: ${BUCKET_NAME}`);
    console.log('This will DELETE ALL FILES permanently!\n');

    let totalDeleted = 0;
    let continuationToken;

    do {
        // List objects (1000 at a time)
        const listCommand = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            MaxKeys: 1000,
            ContinuationToken: continuationToken
        });

        const listResult = await s3Client.send(listCommand);

        if (!listResult.Contents || listResult.Contents.length === 0) {
            console.log('No more objects to delete.');
            break;
        }

        // Prepare delete batch
        const objectsToDelete = listResult.Contents.map(obj => ({ Key: obj.Key }));

        console.log(`Deleting ${objectsToDelete.length} objects...`);

        // Delete batch
        const deleteCommand = new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: { Objects: objectsToDelete }
        });

        await s3Client.send(deleteCommand);
        totalDeleted += objectsToDelete.length;

        console.log(`Deleted batch. Total so far: ${totalDeleted}`);

        continuationToken = listResult.NextContinuationToken;

    } while (continuationToken);

    console.log(`\n✅ Done! Deleted ${totalDeleted} objects from ${BUCKET_NAME}`);
}

emptyBucket().catch(console.error);
