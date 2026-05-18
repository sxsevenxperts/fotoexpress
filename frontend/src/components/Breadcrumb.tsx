import { useLocation } from 'react-router-dom';
import './Breadcrumb.css';

interface Step {
  path: string;
  label: string;
  number: number;
}

const CHECKOUT_STEPS: Step[] = [
  { path: '/cart', label: 'Carrinho', number: 1 },
  { path: '/checkout', label: 'Pagamento', number: 2 },
  { path: '/downloads', label: 'Confirmação', number: 3 }
];

export default function Breadcrumb() {
  const location = useLocation();
  
  const currentStep = CHECKOUT_STEPS.find(step => step.path === location.pathname);
  
  if (!currentStep) return null;

  return (
    <div className="breadcrumb-container">
      <div className="breadcrumb">
        {CHECKOUT_STEPS.map((step, index) => (
          <div key={step.path} className="breadcrumb-item">
            <div className={`breadcrumb-step ${step.number <= currentStep.number ? 'active' : ''} ${step.number === currentStep.number ? 'current' : ''}`}>
              {step.number}
            </div>
            <span className={`breadcrumb-label ${step.number <= currentStep.number ? 'active' : ''}`}>
              {step.label}
            </span>
            {index < CHECKOUT_STEPS.length - 1 && (
              <div className={`breadcrumb-line ${step.number < currentStep.number ? 'completed' : ''}`}></div>
            )}
          </div>
        ))}
      </div>
      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${((currentStep.number - 1) / (CHECKOUT_STEPS.length - 1)) * 100}%` }}
        ></div>
      </div>
    </div>
  );
}
