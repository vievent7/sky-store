const { db } = require('./services/database');

async function main() {
  await db.prepare('SELECT 1').then(s => s.step() && s.free()); // ensure ready

  const users = await db.prepare('SELECT id, email FROM users').then(s => s.all());
  console.log('Users:', JSON.stringify(users, null, 2));

  const cart = await db.prepare('SELECT * FROM cart').then(s => s.all());
  console.log('Cart items:', JSON.stringify(cart, null, 2));

  const userPatrick = users.find(u => u.email && u.email.toLowerCase().includes('patrick'));
  if (userPatrick) {
    await db.run('DELETE FROM cart WHERE user_id = ?', userPatrick.id);
    console.log(`Panier vidé pour user ${userPatrick.id} (${userPatrick.email})`);
  } else if (users.length > 0) {
    console.log('Patrick non trouvé, panier vidé pour user:', users[0].id);
    await db.run('DELETE FROM cart WHERE user_id = ?', users[0].id);
  }
}

main().catch(console.error);
