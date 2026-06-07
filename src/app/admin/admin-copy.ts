export function versionStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "טיוטה",
    published: "פורסם",
    archived: "בארכיון",
  };

  return labels[status] ?? status;
}

export function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    created: "נוצר",
    pending: "ממתין",
    paid: "שולם",
    failed: "נכשל",
    cancelled: "בוטל",
    refunded: "זוכה",
  };

  return labels[status] ?? status;
}

export function reportStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "ממתין",
    generating: "בהפקה",
    completed: "הושלם",
    failed: "נכשל",
  };

  return labels[status] ?? status;
}

export function questionnairePurposeLabel(purpose: string) {
  const labels: Record<string, string> = {
    paid_report: "דוח בתשלום",
    matching: "התאמות",
  };

  return labels[purpose] ?? purpose;
}

export function questionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    multiple_choice: "בחירה מרובה",
    scale: "סולם",
    open_text: "טקסט פתוח",
  };

  return labels[type] ?? type;
}
