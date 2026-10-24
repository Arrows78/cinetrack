import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../accordion";

describe("Accordion", () => {
  it("reveals content when its trigger is clicked", async () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Section title</AccordionTrigger>
          <AccordionContent>Hidden content</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Section title" }));

    expect(await screen.findByText("Hidden content")).toBeVisible();
  });

  it("wraps each trigger in an h3, or an h2 when asked", () => {
    render(
      <Accordion type="multiple">
        <AccordionItem value="default">
          <AccordionTrigger>Nested</AccordionTrigger>
        </AccordionItem>
        <AccordionItem value="top">
          <AccordionTrigger headingLevel={2}>Top level</AccordionTrigger>
        </AccordionItem>
      </Accordion>
    );

    expect(screen.getByRole("heading", { level: 3, name: "Nested" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Top level" })).toBeInTheDocument();
  });
});
