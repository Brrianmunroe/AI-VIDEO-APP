import React from 'react';
import NavBarButton from './NavBarButton';
import './styles/NavigationBar.css';

/**
 * NavigationBar (Sidebar) Component
 * 
 * Matches the Figma "Sidebar" component (node 403:2122).
 * Vertical sidebar composed of NavBarButtons:
 *   Top: Home, Projects, Footage, Search
 *   Bottom: Settings
 * 
 * @param {string} activeItem - Currently active nav item id
 * @param {function} onNavigate - Called with nav item id when clicked
 */
function NavigationBar({ activeItem = 'home', onNavigate }) {
  const topItems = [
    { id: 'home', label: 'Home' },
    { id: 'projects', label: 'Projects' },
    { id: 'footage', label: 'Footage' },
    { id: 'search', label: 'Search' },
  ];

  const handleClick = (itemId) => {
    onNavigate?.(itemId);
  };

  return (
    <nav className="sidebar">
      <div className="sidebar__top">
        {topItems.map((item) => (
          <NavBarButton
            key={item.id}
            type={item.id}
            label={item.label}
            active={activeItem === item.id}
            onClick={() => handleClick(item.id)}
          />
        ))}
      </div>
      <div className="sidebar__bottom">
        <NavBarButton
          type="settings"
          label="Settings"
          active={activeItem === 'settings'}
          onClick={() => handleClick('settings')}
        />
      </div>
    </nav>
  );
}

export default NavigationBar;
