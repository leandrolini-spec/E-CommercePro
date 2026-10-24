"use client";

import { Button } from "@/components/ui/primitives";

export function ExportCsv({ filename, csv }: { filename: string; csv: string }) {
  function download() {
    // BOM para que Excel abra bien los acentos.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return <Button variant="secondary" onClick={download}>Exportar CSV</Button>;
}
