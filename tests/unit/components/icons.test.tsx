import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InfoIcon, LightbulbIcon } from '../../../src/components/icons';

describe('icons', () => {
  it('renders decorative SVGs with the provided class', () => {
    const { container } = render(
      <>
        <InfoIcon className="info" />
        <LightbulbIcon className="bulb" />
      </>,
    );

    expect(container.querySelector('svg.info')).toBeInTheDocument();
    expect(container.querySelector('svg.bulb')).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });
});
