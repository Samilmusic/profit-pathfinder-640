import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  { email: "heidariali91@yahoo.com", password: "Xe2323", display_name: "ALI", role: "partner" },
  { email: "samilmusic@yahoo.com",  password: "Xe2323", display_name: "Milad", role: "partner" },
  { email: "mahnosh_n@yahoo.com",   password: "Xe2323", display_name: "Ms Naeimi", role: "accountant" },
];

async function findUser(email) {
  // paginate list
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

for (const u of USERS) {
  let user = await findUser(u.email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { display_name: u.display_name },
    });
    if (error) throw error;
    user = data.user;
    console.log("created", u.email, user.id);
  } else {
    // Reset password to bootstrap value + confirm email + reset flag
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: u.password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log("updated", u.email, user.id);
  }

  // Upsert profile
  const { error: pe } = await admin.from("profiles").upsert({
    id: user.id,
    email: u.email,
    display_name: u.display_name,
    must_change_password: true,
  }, { onConflict: "id" });
  if (pe) throw pe;

  // Replace role
  await admin.from("user_roles").delete().eq("user_id", user.id);
  const { error: re } = await admin.from("user_roles").insert({ user_id: user.id, role: u.role });
  if (re) throw re;

  console.log("  role:", u.role, "must_change_password: true");
}
console.log("DONE");
