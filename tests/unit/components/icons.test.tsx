import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  DownloadIcon,
  InfoIcon,
  LightbulbIcon,
} from '../../../src/components/icons';

describe('icons', () => {
  it('renders decorative SVGs with the provided class', () => {
    const { container } = render(
      <>
        <InfoIcon className="info" />
        <LightbulbIcon className="bulb" />
        <DownloadIcon className="download" />
      </>,
    );

    expect(container.querySelector('svg.info')).toBeInTheDocument();
    expect(container.querySelector('svg.bulb')).toBeInTheDocument();
    expect(container.querySelector('svg.download')).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(3);
  });
});
