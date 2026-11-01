import { useProps, useScoped } from "../lib/scoped";
import { useI18n } from "../i18n";
import { daysBetween, fmtDate, todayStr } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import type { Contract, Tenant } from "../lib/types";
import { docTypeOf } from "../lib/idDoc";

/** Danh sách người đang ở để đăng ký/gia hạn tạm trú (thực hiện trên VNeID / Cổng dịch vụ công). */
export default function ResidencePage() {
  const { L } = useI18n();
  const { inScope, byId } = useProps();
  const tenants = useScoped<Tenant>("tenants").data;
  const contracts = useScoped<Contract>("contracts").data.filter((c) => c.status === "hieu_luc" && inScope(c.propertyId));
  const today = todayStr();
  const rows = contracts.flatMap((c) => c.occupants.filter((o) => !o.to || o.to >= today).map((o) => ({ c, o, t: tenants.find((x) => x.id === o.tenantId) })))
    .sort((a, b) => a.c.roomCode.localeCompare(b.c.roomCode, "vi", { numeric: true }));
  const missing = (t?: Tenant) => !t ? ["chưa có hồ sơ"] : [!t.idNumber && `số ${L.docTypeShort[docTypeOf(t)]}`, !t.dob && "ngày sinh", !t.gender && "giới tính", !t.address && "địa chỉ", docTypeOf(t) === "passport" && !t.nationality && "quốc tịch", !t.idFront && "ảnh giấy tờ"].filter(Boolean) as string[];
  const exportCsv = () => downloadCsv(`tam-tru-${today}.csv`, [["Khu", "Địa chỉ", "Phòng", "Họ tên", "Ngày sinh", "Giới tính", "Quốc tịch", "Loại giấy tờ", "Số giấy tờ", "CMND cũ", "Ngày cấp", "Nơi thường trú", "SĐT", "Nghề nghiệp", "Từ ngày", "Tạm trú", "Hạn tạm trú"],
    ...rows.map(({ c, o, t }) => [byId[c.propertyId]?.name, byId[c.propertyId]?.address, c.roomCode, t?.fullName ?? o.name, fmtDate(t?.dob), L.gender[t?.gender ?? ""], t?.nationality || "Việt Nam", t ? L.docTypeShort[docTypeOf(t)] : "", t?.idNumber, t?.oldIdNumber, fmtDate(t?.idIssueDate), t?.address, t?.phone, t?.job, fmtDate(o.from), L.tamTru[t?.tamTru?.status ?? "chua"], fmtDate(t?.tamTru?.to)])]);

  return (
    <>
      <div className="row between"><h2>Tạm trú</h2><button onClick={exportCsv}>Xuất danh sách (CSV)</button></div>
      <p><small>Đăng ký tạm trú làm trên ứng dụng VNeID hoặc Cổng dịch vụ công; trang này giúp theo dõi ai chưa đăng ký, sắp hết hạn, hồ sơ còn thiếu gì. Cập nhật trạng thái trong hồ sơ người cư trú.</small></p>
      <div className="scroll"><table className="tbl">
        <thead><tr><th>Phòng</th><th>Họ tên</th><th>Giới tính</th><th>Từ ngày</th><th>Tạm trú</th><th>Còn thiếu</th></tr></thead>
        <tbody>{rows.map(({ c, o, t }) => {
          const left = t?.tamTru?.to ? daysBetween(today, t.tamTru.to) : null;
          const miss = missing(t);
          return (
            <tr key={c.id + o.tenantId} className={t?.tamTru?.status !== "da_dang_ky" || (left != null && left <= 15) ? "late" : ""}>
              <td><b>{c.roomCode}</b><br /><small>{byId[c.propertyId]?.name}</small></td>
              <td>{t?.fullName ?? o.name}{t && docTypeOf(t) === "passport" && <><br /><small>Hộ chiếu · {t.nationality}</small></>}</td><td>{L.gender[t?.gender ?? ""]}</td><td>{fmtDate(o.from)}</td>
              <td>{L.tamTru[t?.tamTru?.status ?? "chua"]}{t?.tamTru?.to && <small><br />đến {fmtDate(t.tamTru.to)}{left != null && left <= 15 ? ` (còn ${left} ngày)` : ""}</small>}</td>
              <td>{miss.length ? <small className="error">{miss.join(", ")}</small> : "✅"}</td>
            </tr>);
        })}</tbody>
      </table></div>
    </>
  );
}
