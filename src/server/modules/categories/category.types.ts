export type ManageCategoryAction = "list" | "create" | "update" | "delete";

export type ManageCategoryRequest = {
  action: ManageCategoryAction;
  id?: string;
  data?: Record<string, unknown>;
};
