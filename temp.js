require("dotenv").config();
const AWS = require("aws-sdk");

AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_CREDENTIALS_KEY,
  secretAccessKey: process.env.AWS_CREDENTIALS_SECRET,
});

const s3 = new AWS.S3({ apiVersion: "2006-03-01" });

(async () => {
  try {
    const data = await s3
      .listObjectsV2({
        Bucket: process.env.S3_BUCKET,
      })
      .promise();

    console.log("RAW RESPONSE:");
    console.log(JSON.stringify(data, null, 2));

    console.log("FILES:");
    console.log(data.Contents);
  } catch (err) {
    console.error("ERROR:", err);
  }
})();
