window.addEventListener('load', init);

/* ---------- RESET PASSWORD ADMIN ---------- */
async function resetAdminPassword(newPassword){
  if(typeof newPassword !== 'string' || newPassword.length < 6){
    alert('Password baru minimal 6 karakter.');
    return;
  }

  let savedUsers = LS.get('kasir_users', []);
  const adminUsername = 'upsmkyadika';

  const admin = {
    u: adminUsername,
    name: 'Admin UP',
    role: 'admin',
    h: await H(newPassword)
  };

  const index = savedUsers.findIndex(user => user.u === adminUsername);

  if(index >= 0){
    savedUsers[index] = admin;
  } else {
    savedUsers.unshift(admin);
  }

  LS.set('kasir_users', savedUsers);
  users = savedUsers;

  alert(
    'Password admin berhasil direset!\n' +
    'Username: ' + adminUsername
  );
}
