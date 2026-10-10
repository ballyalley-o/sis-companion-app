import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api";
import { Button, Field, H3, Sheet, useToast } from "@/src/ui";

/** Shared approve / reject logic + reject-reason sheet for staff screens. */
export function useDecision() {
  const toast = useToast();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState<any>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const approve = async (r: any) => {
    setBusy(r.id + "a");
    try {
      const res = await api(`/requests/${r.id}/approve`, { method: "POST", body: { note: "" } });
      toast(`${r.number} approved · Zoho ${res.zoho_txn_id}`);
      qc.invalidateQueries();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const reject = async () => {
    const r = rejecting;
    setBusy(r.id + "r");
    try {
      await api(`/requests/${r.id}/reject`, { method: "POST", body: { note } });
      toast(`${r.number} rejected`, "info");
      setRejecting(null);
      setNote("");
      qc.invalidateQueries();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const sheet = (
    <Sheet visible={!!rejecting} onClose={() => setRejecting(null)} testID="reject-sheet">
      <H3>Reject {rejecting?.number}</H3>
      <Field testID="reject-reason-input" label="Reason (sent to driller)" value={note} onChangeText={setNote} multiline placeholder="e.g. Wrong bin, quantity too high" />
      <Button testID="reject-confirm-button" title="Confirm reject" variant="danger" icon="close-thick" loading={busy === rejecting?.id + "r"} onPress={reject} />
      <Button testID="reject-cancel-button" title="Cancel" variant="secondary" onPress={() => setRejecting(null)} />
    </Sheet>
  );
  return { approve, startReject: setRejecting, busy, sheet };
}
