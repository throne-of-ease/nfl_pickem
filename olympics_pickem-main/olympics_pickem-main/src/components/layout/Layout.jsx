import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import styles from './Layout.module.css';

export function Layout() {
  return (
    <div className={styles.layout}>
      <Header />
      <main className={styles.main}>
        <div className={styles.container}>
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default Layout;
