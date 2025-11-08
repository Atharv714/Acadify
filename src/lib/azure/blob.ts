import { BlobServiceClient, ContainerClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from "@azure/storage-blob";

let containerClient: ContainerClient | null = null;

export function getContainerClient(): ContainerClient {
  if (containerClient) return containerClient;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }
  const containerName = process.env.AZURE_STORAGE_CONTAINER || "attachments";

  const service = BlobServiceClient.fromConnectionString(connectionString);
  const container = service.getContainerClient(containerName);
  containerClient = container;
  return containerClient;
}

export async function ensureContainerExists() {
  const container = getContainerClient();
  try {
    await container.createIfNotExists({ access: "container" });
  } catch {
    // ignore
  }
}

// --- SAS helpers ---
let cachedAccount: { name: string; key: string } | null = null;

function getAccountFromConnectionString() {
  if (cachedAccount) return cachedAccount;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING || "";
  // Typical form: DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
  const parts = Object.fromEntries(
    conn.split(";").map((kv) => {
      const idx = kv.indexOf("=");
      if (idx === -1) return [kv.trim(), ""];
      return [kv.slice(0, idx), kv.slice(idx + 1)];
    })
  );
  const name = parts["AccountName"];
  const key = parts["AccountKey"];
  if (!name || !key) throw new Error("Invalid AZURE_STORAGE_CONNECTION_STRING: missing AccountName/AccountKey");
  cachedAccount = { name, key };
  return cachedAccount;
}

function getSharedKeyCredential(): StorageSharedKeyCredential {
  const { name, key } = getAccountFromConnectionString();
  return new StorageSharedKeyCredential(name, key);
}

export function getBlobSasUrl(
  blobName: string,
  permissions: string,
  expiresInSeconds = 60 * 5, // 5 min by default
  contentHeaders?: { contentType?: string; contentDisposition?: string }
) {
  const container = getContainerClient();
  const cred = getSharedKeyCredential();
  const perms = BlobSASPermissions.parse(permissions);
  const startsOn = new Date(Date.now() - 60 * 1000); // clock skew
  const expiresOn = new Date(Date.now() + expiresInSeconds * 1000);

  const sas = generateBlobSASQueryParameters(
    {
      containerName: container.containerName,
      blobName,
      permissions: perms,
      startsOn,
      expiresOn,
      contentType: contentHeaders?.contentType,
      contentDisposition: contentHeaders?.contentDisposition,
    },
    cred
  ).toString();

  const blobUrl = container.getBlobClient(blobName).url;
  return { url: `${blobUrl}?${sas}`, expiresOn };
}
