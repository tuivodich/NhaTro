import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export function useCollection<T extends { id: string }>(name: string, enabled = true) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      collection(db, name),
      (snap) => {
        setData(snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T));
        setLoading(false);
      },
      (err) => { console.error(name, err); setLoading(false); },
    );
  }, [name, enabled]);
  return { data, loading };
}
