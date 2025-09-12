import { Button } from "@/components/ui/button";
import { 
  Mail, 
  Phone, 
  MapPin, 
  Clock,
  Send,
  ArrowRight,
  MessageCircle,
  Calendar
} from "lucide-react";

const ContactSection = () => {
  return (
    <section id="contact" className="py-20 bg-background-alt">
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-6">
            Start Your <span className="bg-gradient-accent bg-clip-text text-transparent">Journey</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Ready to transform your trading? Join our fellowship today and take the first step toward financial success.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left: Contact Form */}
          <div className="bg-card rounded-2xl p-8 border border-border shadow-card">
            <div className="mb-8">
              <h3 className="font-display text-2xl font-semibold text-card-foreground mb-2">
                Get Started Today
              </h3>
              <p className="text-muted-foreground">
                Fill out the form below and we'll be in touch within 24 hours to discuss how we can help you succeed.
              </p>
            </div>

            <form className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-3 bg-input border border-border rounded-lg text-card-foreground placeholder-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-3 bg-input border border-border rounded-lg text-card-foreground placeholder-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-3 bg-input border border-border rounded-lg text-card-foreground placeholder-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                  placeholder="john.doe@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  className="w-full px-4 py-3 bg-input border border-border rounded-lg text-card-foreground placeholder-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Trading Experience
                </label>
                <select className="w-full px-4 py-3 bg-input border border-border rounded-lg text-card-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors">
                  <option value="">Select your experience level</option>
                  <option value="beginner">Beginner (0-1 years)</option>
                  <option value="intermediate">Intermediate (1-3 years)</option>
                  <option value="advanced">Advanced (3+ years)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-card-foreground mb-2">
                  Message
                </label>
                <textarea
                  rows={4}
                  className="w-full px-4 py-3 bg-input border border-border rounded-lg text-card-foreground placeholder-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors resize-none"
                  placeholder="Tell us about your trading goals and how we can help..."
                ></textarea>
              </div>

              <Button variant="hero" size="lg" className="w-full group">
                <Send className="w-5 h-5 mr-2" />
                Send Message
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </form>
          </div>

          {/* Right: Contact Info & CTAs */}
          <div className="space-y-8">
            {/* Contact Information */}
            <div className="bg-card rounded-2xl p-8 border border-border shadow-card">
              <h3 className="font-display text-xl font-semibold text-card-foreground mb-6">
                Contact Information
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-card-foreground">Email</div>
                    <div className="text-muted-foreground">hello@koinonia.trading</div>
                    <div className="text-muted-foreground">support@koinonia.trading</div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <div className="font-medium text-card-foreground">Phone</div>
                    <div className="text-muted-foreground">+1 (555) 123-4567</div>
                    <div className="text-muted-foreground text-sm">Mon-Fri, 9AM-5PM EST</div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-success/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <div className="font-medium text-card-foreground">Location</div>
                    <div className="text-muted-foreground">New York, NY</div>
                    <div className="text-muted-foreground text-sm">Serving traders worldwide</div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-warning/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <div className="font-medium text-card-foreground">Market Hours</div>
                    <div className="text-muted-foreground">9:30AM - 4:00PM EST</div>
                    <div className="text-muted-foreground text-sm">Live support during market hours</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-4">
              <Button variant="outline" size="lg" className="w-full group">
                <MessageCircle className="w-5 h-5 mr-2" />
                Join Our Discord Community
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              
              <Button variant="premium" size="lg" className="w-full group">
                <Calendar className="w-5 h-5 mr-2" />
                Schedule Free Consultation
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="bg-gradient-card rounded-xl p-6 border border-border text-center">
              <h4 className="font-display font-semibold text-card-foreground mb-4">
                Trusted by 2,500+ Traders
              </h4>
              <div className="flex justify-center items-center gap-6 text-sm text-muted-foreground">
                <span>⭐⭐⭐⭐⭐</span>
                <span>4.9/5 Rating</span>
                <span>100+ Reviews</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;