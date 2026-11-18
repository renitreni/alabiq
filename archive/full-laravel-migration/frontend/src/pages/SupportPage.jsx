import Navbar from "../components/Navbar";
import Footer from "../sections/Footer";
import CustomerService from "../sections/CustomerService";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-brand-light text-brand-dark pt-20">
      <Navbar />
      <main>
        <CustomerService />
      </main>
      <Footer />
    </div>
  );
}
