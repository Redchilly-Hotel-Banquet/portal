export type ManageOutletAction = "list" | "create" | "update" | "delete";

export type ManageOutletRequest = {
  action: ManageOutletAction;
  id?: string;
  data?: Record<string, unknown>;
};
