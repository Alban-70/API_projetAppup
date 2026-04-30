const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");

AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_CREDENTIALS_KEY,
  secretAccessKey: process.env.AWS_CREDENTIALS_SECRET,
});

const s3 = new AWS.S3();

function uploadToS3(bucket, file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file provided"));

    let Body;
    let Key;

    // multer diskStorage
    if (file.path) {
      Body = fs.createReadStream(file.path);
      Key = `${Date.now()}-${path.basename(file.path)}`;
    }

    // multer memoryStorage
    else if (file.buffer) {
      Body = file.buffer;
      Key = `${Date.now()}-${file.originalname}`;
    } else {
      return reject(new Error("Invalid file format"));
    }

    const params = {
      Bucket: bucket,
      Key,
      Body,
      ContentType: file.mimetype,
    };

    console.log("Uploading to S3:", params);

    s3.upload(params, (err, data) => {
      if (err) {
        console.error("S3 ERROR:", err);
        return reject(err);
      }

      console.log("S3 UPLOAD SUCCESS:", data.Location);
      resolve(data.Location);
    });
  });
}

module.exports = uploadToS3;
