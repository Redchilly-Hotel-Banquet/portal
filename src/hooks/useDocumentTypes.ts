"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/apiClient";
import { DEFAULT_DOCUMENT_TYPES, normaliseDocumentTypes, setActiveDocumentTypes, type DocumentTypeConfig } from "@/lib/document-types";

/** The accepted identity documents and their photos, with the standard list until the real one arrives. */
export function useDocumentTypes(): DocumentTypeConfig[] {
  const query = useQuery({
    queryKey: ["document-types"],
    queryFn: () => apiGet<{ document_types?: unknown }>("/public/document-types"),
    select: (data) => {
      const types = normaliseDocumentTypes(data?.document_types);
      setActiveDocumentTypes(types);
      return types;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return query.data ?? DEFAULT_DOCUMENT_TYPES;
}
