import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Navbar from "../../components/Navbar";
import Footer from "../../sections/Footer";
import useScrollToHash from "../../hooks/useScrollToHash";
import { Button } from "../../components/ui/button";

const ServiceDetailLayout = ({ children }) => {
  useScrollToHash();

  return (
    <div className="min-h-screen bg-brand-light text-brand-dark pt-20">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 md:px-16 lg:px-20 pt-8">
        <Button asChild variant="ghost" size="sm" className="text-brand-grey hover:text-brand-orange">
          <Link to="/services">
            <ArrowLeft className="w-4 h-4" />
            Back to Services
          </Link>
        </Button>
      </div>

      <main>{children}</main>

      <Footer />
    </div>
  );
};

export default ServiceDetailLayout;
