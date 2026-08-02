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
});
