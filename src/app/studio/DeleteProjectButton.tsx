"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("Delete this whole project — all its clips and renders? This can't be undone.")) return;

    setDeleting(true);
    try {
      const response = await fetch("/api/projects/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!response.ok) throw new Error("Delete failed");
      router.refresh();
    } catch {
      setDeleting(false);
      window.alert("Couldn't delete this project — try again.");
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="ml-3 shrink-0 text-neutral-400 hover:text-red-600"
      aria-label="Delete project"
    >
      {deleting ? "…" : "Delete"}
    </button>
  );
}
