import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';
import * as path from 'path';

export type UploadedFileInfo = {
  path: string;
  url: string;
  contentType: string;
  size: number;
};

@Injectable()
export class FilesService {
  private readonly useCloudinary =
    !!process.env.CLOUDINARY_URL ||
    (!!process.env.CLOUDINARY_CLOUD_NAME &&
      !!process.env.CLOUDINARY_API_KEY &&
      !!process.env.CLOUDINARY_API_SECRET);

  private bucket = this.useCloudinary ? null : this.getFirebaseBucket();

  constructor() {
    if (this.useCloudinary) {
      this.initCloudinary();
    }
  }

  private initCloudinary() {
    const hasUrl = !!process.env.CLOUDINARY_URL;
    if (hasUrl) {
      cloudinary.config({
        secure: true,
        cloudinary_url: process.env.CLOUDINARY_URL,
      } as any);
    } else {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
    }
  }

  private getFirebaseBucket() {
    if (!admin.apps.length) {
      const projectId = process.env.FIREBASE_PROJECT_ID as string;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL as string;
      const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY as string;
      const privateKey = privateKeyRaw?.replace(/\\n/g, '\n');

      if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          } as admin.ServiceAccount),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
      } else {
        admin.initializeApp();
      }
    }
    return admin.storage().bucket();
  }

  async uploadBuffer(
    buffer: Buffer,
    destinationPath: string,
    contentType: string,
    makePublic = true,
  ): Promise<UploadedFileInfo> {
    if (this.useCloudinary) {
      const { folder, publicId } = this.splitPath(destinationPath);
      const result = await new Promise<any>((resolve, reject) => {
        const upload = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: publicId,
            overwrite: true,
            resource_type: 'image',
          },
          (err, res) => (err ? reject(err) : resolve(res)),
        );
        streamifier.createReadStream(buffer).pipe(upload);
      });
      return {
        path: result.public_id,
        url: result.secure_url,
        contentType: result.resource_type || contentType,
        size: Number(result.bytes || buffer.length),
      };
    }

    const file = this.bucket.file(destinationPath);
    await file.save(buffer, { contentType, resumable: false, public: false });
    if (makePublic) await file.makePublic();
    const url = makePublic
      ? this.publicUrl(file.name)
      : await this.getSignedUrl(file.name);
    const [meta] = await file.getMetadata();
    return {
      path: file.name,
      url,
      contentType: meta.contentType || contentType,
      size: Number(meta.size || buffer.length),
    };
  }

  async deleteFile(filePath: string) {
    if (this.useCloudinary) {
      await cloudinary.uploader.destroy(filePath, { resource_type: 'image' });
      return { message: 'Deleted' };
    }
    const file = this.bucket.file(filePath);
    await file.delete({ ignoreNotFound: true });
    return { message: 'Deleted' };
  }

  publicUrl(p: string) {
    if (this.useCloudinary) {
      return cloudinary.url(p, { secure: true });
    }
    const bucketName = this.bucket.name;
    return `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(
      p,
    )}`;
  }

  async getSignedUrl(p: string, expiresInSeconds = 3600) {
    if (this.useCloudinary) {
      // Cloudinary URLs are already signed/secure by default for resources; return secure URL
      return this.publicUrl(p);
    }
    const file = this.bucket.file(p);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresInSeconds * 1000,
    });
    return url;
  }

  private splitPath(destinationPath: string) {
    const normalized = destinationPath.replace(/^\/+/, '');
    const withoutExt = normalized.replace(/\.[^/.]+$/, '');
    const folder = path.posix.dirname(withoutExt);
    const publicId = path.posix.basename(withoutExt);
    return { folder: folder === '.' ? undefined : folder, publicId };
  }
}
