export type DogStatus = "active" | "adopted";

export type Dog = {
  id: string;
  name: string;
  status: DogStatus;
  created_at: string;
};

export type Photo = {
  id: string;
  r2_url: string;
  captured_at: string;
  dog_id: string | null;
  is_used: boolean;
};
