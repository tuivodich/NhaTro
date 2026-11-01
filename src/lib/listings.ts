import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";
import { shrinkImage } from "./image";
import type { Property, Room } from "./types";

/** Đồng bộ bản công khai của phòng: chỉ hiện khi chủ bật "hiện công khai" và phòng đang trống. Không có dữ liệu cá nhân. */
export async function syncListing(room: Room, prop: Property | undefined) {
  const show = !!room.public && room.status === "trong" && !!prop;
  if (!show) { await deleteDoc(doc(db, "listings", room.id)).catch(() => {}); return; }
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));
  await setDoc(doc(db, "listings", room.id), clean({
    propertyId: room.propertyId, propertyName: prop!.name, address: prop!.address, code: room.code, name: room.name, type: room.type,
    area: room.area, rent: room.rent, maxPeople: room.maxPeople, amenities: room.amenities, desc: room.desc, photos: room.photos ?? [],
  }));
}

/** Tải ảnh (đã thu nhỏ) lên Storage; trả về { path, url }. */
export async function uploadImage(path: string, file: File) {
  const blob = await shrinkImage(file);
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: "image/jpeg" });
  return { path, url: await getDownloadURL(r) };
}
export const removeImage = (path: string) => deleteObject(ref(storage, path)).catch(() => {});
export const imageUrl = (path: string) => getDownloadURL(ref(storage, path));
