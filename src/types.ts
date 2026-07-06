export interface CodeTab {
  id: string;
  name: string;
  code: string;
  kind?: 'code' | 'docs' | 'welcome';
  isDirty?: boolean;
  _id?: string;
  path?: string;
}
