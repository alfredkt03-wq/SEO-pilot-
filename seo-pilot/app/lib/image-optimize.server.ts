// "Safe" image optimization (part of the single paid plan): fetches the
// shop's existing image,
// compresses it locally with sharp, and uploads the RESULT as a brand-new
// file in the merchant's Files library. It never touches the live product
// image — the merchant decides if/when to swap it in via the native Shopify
// product editor. This is a deliberate trade-off over in-place replacement:
// slower for the merchant (one extra manual step) but zero risk of breaking
// a live listing's imagery, and no need for us to hold write access to
// product media at all.
import sharp from "sharp";

const MAX_WIDTH = 2048;

export interface CompressedImage {
  buffer: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  originalBytes: number;
  compressedBytes: number;
  width: number | null;
  height: number | null;
}

export async function fetchAndCompressImage(sourceUrl: string): Promise<CompressedImage> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Could not download source image (HTTP ${res.status})`);
  }
  const originalBuffer = Buffer.from(await res.arrayBuffer());

  const image = sharp(originalBuffer, { failOn: "none" });
  const metadata = await image.metadata();
  const format = metadata.format;

  let pipeline = image.resize({ width: MAX_WIDTH, withoutEnlargement: true });

  let contentType: CompressedImage["contentType"];
  let extension: CompressedImage["extension"];
  if (format === "png") {
    pipeline = pipeline.png({ compressionLevel: 9, palette: true });
    contentType = "image/png";
    extension = "png";
  } else if (format === "webp") {
    pipeline = pipeline.webp({ quality: 82 });
    contentType = "image/webp";
    extension = "webp";
  } else {
    // Default to JPEG (mozjpeg-style settings) for jpeg/unknown source formats.
    pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
    contentType = "image/jpeg";
    extension = "jpg";
  }

  const compressedBuffer = await pipeline.toBuffer();
  const finalMeta = await sharp(compressedBuffer).metadata();

  return {
    buffer: compressedBuffer,
    contentType,
    extension,
    originalBytes: originalBuffer.byteLength,
    compressedBytes: compressedBuffer.byteLength,
    width: finalMeta.width ?? null,
    height: finalMeta.height ?? null,
  };
}

export interface UploadedFile {
  fileId: string;
  url: string | null;
}

// admin is the authenticated GraphQL client from authenticate.admin(). Runs
// the three-step Shopify flow for getting bytes we already hold into the
// Files library: stagedUploadsCreate (resource: "IMAGE") -> PUT the bytes to
// the returned URL, sending `parameters` back as HTTP headers -> fileCreate
// referencing the staged resourceUrl. fileCreate returns immediately with the
// file still processing, so we poll node() briefly for the final CDN url.
export async function uploadCompressedImage(
  admin: any,
  compressed: CompressedImage,
  filename: string,
  alt: string | null,
): Promise<UploadedFile> {
  const stagedRes = await admin.graphql(
    `#graphql
    mutation SeoPilotStagedUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: [
          {
            resource: "IMAGE",
            filename,
            mimeType: compressed.contentType,
            httpMethod: "PUT",
            fileSize: String(compressed.buffer.byteLength),
          },
        ],
      },
    },
  );
  const stagedJson = await stagedRes.json();
  const stagedErrors = stagedJson?.data?.stagedUploadsCreate?.userErrors ?? [];
  if (stagedErrors.length > 0) {
    throw new Error(stagedErrors.map((e: any) => e.message).join("; "));
  }
  const target = stagedJson?.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) {
    throw new Error("Shopify didn't return an upload target");
  }

  const headers: Record<string, string> = {};
  for (const p of target.parameters ?? []) {
    headers[p.name] = p.value;
  }
  const putRes = await fetch(target.url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": compressed.contentType },
    body: new Uint8Array(compressed.buffer),
  });
  if (!putRes.ok) {
    throw new Error(`Upload to Shopify's staging URL failed (HTTP ${putRes.status})`);
  }

  const createRes = await admin.graphql(
    `#graphql
    mutation SeoPilotFileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus alt ... on MediaImage { image { url } } }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        files: [
          {
            originalSource: target.resourceUrl,
            contentType: "IMAGE",
            alt: alt ?? undefined,
          },
        ],
      },
    },
  );
  const createJson = await createRes.json();
  const createErrors = createJson?.data?.fileCreate?.userErrors ?? [];
  if (createErrors.length > 0) {
    throw new Error(createErrors.map((e: any) => e.message).join("; "));
  }
  const file = createJson?.data?.fileCreate?.files?.[0];
  if (!file?.id) {
    throw new Error("Shopify didn't return the created file");
  }

  let url: string | null = file.image?.url ?? null;
  // fileCreate returns before processing finishes, so the CDN url is often
  // still null — a short poll usually catches it; if not, the file is still
  // safely in the Files library and viewable from there.
  for (let attempt = 0; !url && attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const pollRes = await admin.graphql(
      `#graphql
      query SeoPilotPollFile($id: ID!) {
        node(id: $id) {
          ... on MediaImage { fileStatus image { url } }
        }
      }`,
      { variables: { id: file.id } },
    );
    const pollJson = await pollRes.json();
    url = pollJson?.data?.node?.image?.url ?? null;
  }

  return { fileId: file.id, url };
}
