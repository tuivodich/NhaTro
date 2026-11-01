import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, call } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useAudit } from "../lib/audit";
import { BANKS, EMPTY_BANK, isBankReady, vietQrUrl, type Bank } from "../lib/banks";
import { randomCode } from "../lib/format";

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <div className="card"><h3>{title}</h3>{children}</div>; }

export default function SettingsPage() {
  const { profile } = useAuth();
  const owner = profile?.role === "owner";
  const audit = useAudit();
  const [bank, setBank] = useState<Bank>(EMPTY_BANK);
  const [contact, setContact] = useState({ name: "", phone: "", zalo: "", email: "" });
  const [hook, setHook] = useState("");
  const [auditOn, setAuditOn] = useState(true);
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");

  useEffect(() => {
    getDoc(doc(db, "settings", "bank")).then((s) => s.exists() && setBank({ ...EMPTY_BANK, ...(s.data() as Bank) })).catch(() => {});
    getDoc(doc(db, "settings", "contact")).then((s) => s.exists() && setContact((c) => ({ ...c, ...s.data() }))).catch(() => {});
    if (owner) getDoc(doc(db, "settings", "bankhook")).then((s) => setHook(s.data()?.token ?? "")).catch(() => {});
    getDoc(doc(db, "settings", "audit")).then((s) => setAuditOn(s.data()?.enabled !== false)).catch(() => {});
  }, [owner]);

  const done = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };
  const fail = (e: unknown) => setMsg("Lỗi: " + (e as Error).message);
  const saveBank = async (e: React.FormEvent) => { e.preventDefault(); try { await setDoc(doc(db, "settings", "bank"), bank); audit("settings.bank", "Đổi tài khoản nhận tiền"); done("Đã lưu tài khoản ngân hàng."); } catch (x) { fail(x); } };
  const saveContact = async (e: React.FormEvent) => { e.preventDefault(); try { await setDoc(doc(db, "settings", "contact"), contact); done("Đã lưu liên hệ."); } catch (x) { fail(x); } };
  const newHook = async () => { const t = randomCode(32); try { await setDoc(doc(db, "settings", "bankhook"), { token: t }); setHook(t); audit("settings.bankhook", "Tạo mã webhook ngân hàng mới"); } catch (x) { fail(x); } };
  const toggleAudit = async () => { try { await setDoc(doc(db, "settings", "audit"), { enabled: !auditOn }); setAuditOn(!auditOn); } catch (x) { fail(x); } };
  const tgLink = async () => { try { const r = await call<{ kind: string }, { link: string }>("tgLinkCode")({ kind: "staff" }); setLink(r.data.link); } catch (x) { fail(x); } };
  const tgSetup = async () => { try { const r = await call<unknown, { username: string }>("tgSetup")({}); done(`Đã kết nối bot @${r.data.username}.`); } catch (x) { fail(x); } };
  const backup = async () => { try { const r = await call<unknown, { file: string }>("backupNow")({}); done(`Đã sao lưu: ${r.data.file}`); } catch (x) { fail(x); } };
  const hookUrl = "https://asia-southeast1-vnhatro.cloudfunctions.net/bankHook";

  return (
    <>
      <h2>Cài đặt</h2>
      {msg && <p className="card">{msg}</p>}
      <Section title="Telegram của tôi">
        <p>Liên kết Telegram để nhận thông báo tiền vào, công nợ, báo hỏng và dùng lệnh nhanh (<code>/dien P1 1234</code>, <code>/congno</code>…).</p>
        <div className="row"><button onClick={tgLink}>Tạo đường dẫn liên kết</button>{link && <a href={link} target="_blank" rel="noreferrer">{link}</a>}</div>
        {owner && <div className="row"><button className="ghost" onClick={tgSetup}>Kết nối bot (chạy một lần sau khi có token)</button></div>}
      </Section>
      {owner && <>
        <Section title="Tài khoản nhận tiền (hiện mã VietQR trên hóa đơn)">
          <form className="col" onSubmit={saveBank}>
            <div className="row">
              <label>Ngân hàng<select value={bank.bankBin} onChange={(e) => setBank({ ...bank, bankBin: e.target.value, bankName: BANKS.find((b) => b.bin === e.target.value)?.name ?? bank.bankName })}><option value="">— Chọn —</option>{BANKS.map((b) => <option key={b.bin} value={b.bin}>{b.name}</option>)}</select></label>
              <label>Số tài khoản<input value={bank.accountNo} onChange={(e) => setBank({ ...bank, accountNo: e.target.value.replace(/\s/g, "") })} required /></label>
              <label>Tên chủ tài khoản (không dấu)<input value={bank.accountName} onChange={(e) => setBank({ ...bank, accountName: e.target.value.toUpperCase() })} required /></label>
            </div>
            {isBankReady(bank) && <img src={vietQrUrl(bank, 0, "NHATRO TEST01")} alt="Mã QR thử" width={160} />}
            <div className="row"><button type="submit">Lưu</button></div>
          </form>
        </Section>
        <Section title="Liên hệ chủ nhà (hiện trên trang công khai và bot)">
          <form className="col" onSubmit={saveContact}>
            <div className="row">
              <label>Tên<input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} /></label>
              <label>Điện thoại<input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></label>
              <label>Zalo<input value={contact.zalo} onChange={(e) => setContact({ ...contact, zalo: e.target.value })} /></label>
              <label>Email<input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
            </div>
            <div className="row"><button type="submit">Lưu</button></div>
          </form>
        </Section>
        <Section title="Tự gạch nợ khi có chuyển khoản (SePay / Casso)">
          <p>Đăng ký SePay hoặc Casso, thêm webhook trỏ tới <code>{hookUrl}</code> với khóa API (Authorization: <code>Apikey &lt;mã&gt;</code>) là mã bên dưới. Người thuê chuyển khoản đúng nội dung <code>NHATRO &lt;mã hóa đơn&gt;</code> thì hệ thống tự cộng tiền và báo Telegram.</p>
          <div className="row">{hook ? <code className="secret">{hook}</code> : <small>Chưa có mã.</small>}<button className="ghost" onClick={newHook}>{hook ? "Đổi mã" : "Tạo mã"}</button></div>
        </Section>
        <Section title="Nhật ký hoạt động & sao lưu">
          <div className="row"><label className="check"><input type="checkbox" checked={auditOn} onChange={toggleAudit} /> Ghi nhật ký hoạt động</label></div>
          <div className="row"><button className="ghost" onClick={backup}>Sao lưu dữ liệu ngay</button><small>Bản sao lưu (JSON) lưu trong Cloud Storage, thư mục backups/.</small></div>
        </Section>
      </>}
    </>
  );
}
